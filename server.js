import express from "express";
import dotenv from "dotenv";
import { generate } from "./chatbot.js";
import cors from 'cors';

dotenv.config();

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "https://sujal-ai-chatbot.netlify.app",
    credentials: true,
  })
);



const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.post("/chat", async (req, res) => {
  try {
    const { message, threadId } = req.body;

    const result = await generate(message, threadId);

    if (!message || !threadId){
        res.status(400).json({message: "All Fields Are Required"});
        return
    }

    res.json({
      message: result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});