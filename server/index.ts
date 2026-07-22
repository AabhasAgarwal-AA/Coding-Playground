import express, { type Request, type Response, type NextFunction } from "express";
import {createClient} from "redis";
import { prisma } from "./db";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3003";

if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
}

const redis = createClient({
    url: REDIS_URL,
});

redis.on("error", (error) => {
    console.error("Redis error:", error);
});

console.log("working");
const app = express();

app.use(helmet());

app.use(
    cors({
        origin: CORS_ORIGIN,
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use(
    express.json({
        limit: "110kb",
        strict: true,
    }),
);

app.use(
    rateLimit({
        windowMs: 60 * 1000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            message: "Too many requests. Try again later.",
        },
    }),
);

const submissionSchema = z.object({
    code: z.string().min(1, "Code is required").max(100_000, "Code cannot exceed 100,000 characters"), 
    language: z.enum(["cpp", "js", "py"]),
});

const submissionIdSchema = z.string().uuid();

// for corn job
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
    });
});

app.post("/submission", async (req: Request, res: Response, next: NextFunction) => {
    
    try{
        const validation = submissionSchema.safeParse(req.body);
        if(!validation.success){
            res.status(400).json({
                message: "Invalid submission", 
                errors: validation.error.flatten()
            });
            return;
        }

        const {code, language} = validation.data;
        const submission = await prisma.submissions.create({
            data: {
                code, 
                language, 
                status: "Processing"
            }, 
            select: {
                id: true, 
                status: true
            },
        });

        try {
            await redis.lPush(
                "problems", 
                JSON.stringify({
                    submissionId: submission.id
                }),
            );
        } catch (queueError){
            await prisma.submissions.update({
                where: {
                    id: submission.id, 
                },
                data: {
                    status: "Failure", 
                    stdErr: "The submission could not be queued",
                }
            });
            throw queueError;
        }

        res.status(202).json({
            message: "processing", 
            id: submission.id, 
            status: submission.status, 
        });

    } catch (error) {
        next(error);
    }
}); 


app.get("/submission/:submissionId", async (req: Request, res: Response, next: NextFunction) => {

    try {
        const idValidation = submissionIdSchema.safeParse(req.params.submissionId);
        if(!idValidation.success){
            res.status(400).json({
                message: "Invalid Submission ID"
            });
            return;
        }

        const submission = await prisma.submissions.findUnique({
            where: {
                id: idValidation.data
            },

            select: {
                id: true, 
                language: true, 
                status: true, 
                output: true, 
                stdErr: true,
                createdAt: true,
                updatedAt: true,  
            }
        });
        if(!submission){
            res.status(404).json({
                message: "Submssion not found"
            }); 
            return;
        }
        res.json({
            submission,
        });

    } catch (error){
        next(error);
    }

});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.log("Unhandled server error: ", error);
    res.status(500).json({
        message: "Internal server error"
    });
});

async function start(): Promise<void>{
    await redis.connect();
    app.listen(PORT, () => {
        console.log(`API server listening on port ${PORT}`);
    });
}

async function shutdown(signal: string): Promise<void>{
    console.log(`Received ${signal}; shutting down`);
    await Promise.allSettled([redis.quit(), prisma.$disconnect()]);
    process.exit(0);
}

process.on("SIGINT", () => {
    void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});

start().catch(async (error) => {
    console.error("Failed to start server:", error);
    await Promise.allSettled([redis.disconnect(), prisma.$disconnect()]);

    process.exit(1);
});