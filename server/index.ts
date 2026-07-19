import express from "express";
import {createClient} from "redis";
import { prisma } from "./db";
import cors from "cors";

const client = createClient({
    url: process.env.REDIS_URL,
});

client.connect();

console.log("working");
const app = express();
app.use(express.json());
app.use(cors())

app.post("/submission", async (req, res) => {
    // const userId = req.body.userId; 
    const code = req.body.code;
    const language = req.body.language; 

    const response = await prisma.submissions.create({
        data: {
            code,
            language, 
            status: "Processing"
        }
    });
    
    client.lPush("problems", JSON.stringify({submissionId: response.id, code, language}));

    res.json({
        message: "processing",
        id: response.id
    })


}); 


app.get("/submission/:submissionId", async (req, res) => {

    try{
        const response = await prisma.submissions.findFirst({
            where: {
                id: req.params.submissionId
            }
        });

        res.json({
            submission: response
        });

    } catch (error) {
        res.json({
            message: "could not find the submission"
        });
    }
});

app.listen(3000);