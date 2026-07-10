
import { createClient } from "redis";
import fs from "fs";
import { spawn } from "child_process";

const client = createClient({
    url: process.env.REDIS_URL,
});

client.connect()
    .then(async () => {
        while(1) {
            const response = await client.rPop("problems");
            if(!response){
                await new Promise((r) => setTimeout(r, 1000));
                continue; 
            }

            const parsedResponse = JSON.parse(response);

            const code = parsedResponse.code; 
            const language = parsedResponse.language; 

            if(language === "c++"){
                console.log("running c++ code for the user");
                
                const filePath = __dirname + "/code/a.cpp";

                fs.writeFileSync(filePath, code);
                spawn("g++", [filePath, "-o", "./code/out"]);
                await new Promise((r) => setTimeout(r, 2000));

                const response = spawn("./code/out");

                response.stdout.on("data", (chunk) => {
                    console.log(chunk.toString());
                });

            }

            if (language === "js") {
                console.log("running JS code for the user");
                
                const filePath = __dirname + "/code/a.js";

                fs.writeFileSync(filePath, code);
                const response = spawn("node", [filePath]);
                response.stdout.on("data", (chunk) => {
                    console.log(chunk.toString());
                });
            }

            if (language === "py") {
                console.log("running py code for the user");
                
                const filePath = __dirname + "/code/a.py";

                fs.writeFileSync(filePath, code);
                const response = spawn("python3", [filePath]);
                response.stdout.on("data", (chunk) => {
                    console.log(chunk.toString());
                });


            }

        }
    });