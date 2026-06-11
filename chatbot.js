import { GoogleGenAI } from "@google/genai";
import { tavily } from "@tavily/core";
import dotenv from "dotenv";
import NodeCache from "node-cache";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const tvly = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});

const myCache = new NodeCache({
  stdTTL: 60 * 60 * 24, // 24 hours
});

async function searchWeb(query) {
  try {
    const cacheKey = `search:${query.toLowerCase()}`;

    const cachedResult = myCache.get(cacheKey);

    if (cachedResult) {
      console.log("Search Cache Hit");
      return cachedResult;
    }

    const result = await tvly.search(query);

    const formattedResult = result.results
      .slice(0, 5)
      .map(
        (item) =>
          `Title: ${item.title}\n${item.content}`
      )
      .join("\n\n");

    myCache.set(cacheKey, formattedResult);

    return formattedResult;
  } catch (error) {
    console.error("Search Error:", error);
    return "Unable to retrieve search results.";
  }
}

const tools = [
  {
    functionDeclarations: [
      {
        name: "searchWeb",
        description:
          "Search the internet for current information including news, stock prices, sports results, weather, product prices, company information, and real-time facts.",

        parameters: {
          type: "OBJECT",

          properties: {
            query: {
              type: "STRING",
              description: "Search query",
            },
          },

          required: ["query"],
        },
      },
    ],
  },
];

const SYSTEM_PROMPT = `
You are a helpful AI assistant.

Provide accurate answers.
Explain technical topics clearly.
Give working code when asked.

Use searchWeb whenever information may be current or changing.
Never invent real-time information.
`;

function getHistory(threadId) {
  return myCache.get(`chat:${threadId}`) || [];
}

function saveHistory(threadId, history) {
  myCache.set(`chat:${threadId}`, history);
}

export async function generate(userMessage, threadId) {
  try {
    const history = getHistory(threadId);

    history.push({
      role: "user",
      parts: [
        {
          text: userMessage,
        },
      ],
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",

      contents: history,

      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools,
      },
    });

    const toolCall =
      response.candidates?.[0]?.content?.parts?.find(
        (part) => part.functionCall
      );

    // No Tool Call
    if (!toolCall) {
      history.push({
        role: "model",
        parts: [
          {
            text: response.text,
          },
        ],
      });

      saveHistory(threadId, history);

      return response.text;
    }

    const query =
      toolCall.functionCall.args?.query;

    if (!query) {
      return "No search query provided.";
    }

    console.log("Searching:", query);

    const searchResult =
      await searchWeb(query);

    const finalResponse =
      await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",

        config: {
          systemInstruction: SYSTEM_PROMPT,
        },

        contents: [
          ...history,

          {
            role: "model",
            parts: [
              {
                functionCall:
                  toolCall.functionCall,
              },
            ],
          },

          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: "searchWeb",
                  response: {
                    result: searchResult,
                  },
                },
              },
            ],
          },
        ],
      });

    history.push({
      role: "model",
      parts: [
        {
          text: finalResponse.text,
        },
      ],
    });

    saveHistory(threadId, history);

    return finalResponse.text;
  } catch (error) {
    console.error(
      "Generate Function Error:",
      error
    );

    if (error.status === 429) {
      return "Gemini API quota exceeded. Please wait and try again.";
    }

    return "Something went wrong.";
  }
}