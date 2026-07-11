import express from "express";
import {createClient} from "redis";
import { prisma } from "./db";

const client = createClient({
    url: process.env.REDIS_URL,
});

client.connect();

console.log("working");
const app = express();
app.use(express.json());

app.post("/submission", async (req, res) => {
    const userId = req.body.userId; 
    const code = req.body.code;
    const language = req.body.language; 

    const response = await prisma.submissions.create({
        data: {
            code,
            language, 
            status: "Processing"
        }
    });
    
    client.lPush("problems", JSON.stringify({submissionid: response.id, code, language}));

    res.json({
        message: "processing",
        id: response.id
    })


}); 


app.get("/submission/:submisssionId", (req, res) => {

});

app.listen(3000);