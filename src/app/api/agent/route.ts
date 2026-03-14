import { NextResponse } from 'next/server';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { makeOpenRouterRequest } from '@/lib/llm';
import { searchOpenAlex } from '@/lib/openalex';

// Define the state schema for our agent workflow
const AgentState = Annotation.Root({
  userPrompt: Annotation<string>(),
  taskType: Annotation<"research" | "write" | "unknown">(),
  researchQueries: Annotation<string[]>(),
  researchData: Annotation<any[]>(),
  finalDraft: Annotation<string>(),
});

/**
 * MANAGER NODE: Analyzes the user prompt to determine the workflow path.
 */
async function managerNode(state: typeof AgentState.State) {
  console.log("--> MANAGER NODE EXECUTING");
  const prompt = `You are the Manager Agent for a Word Add-in. 
Your job is to analyze the user's request and determine if it requires scientific research/citations (taskType: "research") or just direct writing/formatting without research (taskType: "write").
If "research", also provide 1-3 search queries for a database like OpenAlex.
Output ONLY JSON in this format: 
{ "taskType": "research" | "write", "researchQueries": ["query1", "query2"] }`;

  const responseJsonStr = await makeOpenRouterRequest(prompt, state.userPrompt);
  
  try {
    // Attempt to parse JSON response. The LLM might wrap it in markdown block.
    const cleanJsonStr = responseJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJsonStr);
    
    return {
      taskType: result.taskType || "write",
      researchQueries: result.researchQueries || [],
    };
  } catch (error) {
    console.log("Manager parse error, defaulting to write task");
    return { taskType: "write", researchQueries: [] };
  }
}

/**
 * RESEARCHER NODE: Calls OpenAlex API using queries determined by Manager.
 */
async function researcherNode(state: typeof AgentState.State) {
  console.log("--> RESEARCHER NODE EXECUTING");
  const allData = [];
  
  if (state.researchQueries && state.researchQueries.length > 0) {
    for (const q of state.researchQueries) {
      const results = await searchOpenAlex(q, 2); // get top 2 per query
      allData.push(...results);
    }
  }

  return {
    researchData: allData
  };
}

/**
 * WRITER NODE: Generates the final text or Word automation commands.
 */
async function writerNode(state: typeof AgentState.State) {
  console.log("--> WRITER NODE EXECUTING");
  
  let contextStr = "";
  if (state.researchData && state.researchData.length > 0) {
    contextStr = "\n\nUse the following research references as citations/bibliography:\n" + 
      JSON.stringify(state.researchData, null, 2);
  }

  const prompt = `You are an expert Writer Agent embedded in Microsoft Word.
Your task is to fulfill the user's document generation request.
${contextStr}

Generate the final output exactly as the user requested. If there are citations, format them properly (e.g., APA). Include a References list at the bottom if research data was provided.
Ensure the layout is professional. Use Markdown format for structure.`;

  const finalDraft = await makeOpenRouterRequest(prompt, state.userPrompt);
  
  return {
    finalDraft: finalDraft
  };
}

// Map the next node after manager
const determineNextNode = (state: typeof AgentState.State) => {
  if (state.taskType === "research") {
    return "researcher";
  }
  return "writer";
};

// Build the Graph
const buildAgentGraph = () => {
  const workflow = new StateGraph(AgentState)
    .addNode("manager", managerNode)
    .addNode("researcher", researcherNode)
    .addNode("writer", writerNode)
    
    .addEdge(START, "manager")
    .addConditionalEdges("manager", determineNextNode, {
      researcher: "researcher",
      writer: "writer",
    })
    .addEdge("researcher", "writer")
    .addEdge("writer", END);

  // Compile
  const app = workflow.compile();
  return app;
};


export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const app = buildAgentGraph();

    // Invoke workflow
    const result = await app.invoke({
      userPrompt: prompt,
      taskType: "unknown",
      researchQueries: [],
      researchData: [],
      finalDraft: ""
    });

    return NextResponse.json({
      success: true,
      draft: result.finalDraft,
      researchCount: result.researchData?.length || 0
    });
  } catch (error: any) {
    console.error("Agent Workflow Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
