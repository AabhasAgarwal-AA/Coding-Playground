
import { createClient } from "redis";

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
                await new Promise((r) => setTimeout(r, 3000));
            }

            if (language === "javascript") {
                console.log("running JS code for the user");
                await new Promise((r) => setTimeout(r, 2000));
            }

        }
    });