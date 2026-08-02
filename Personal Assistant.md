````mermaid
graph TD
    subgraph L1 ["Package: Input / Output Layer"]
        Discord["Discord Channel"]
        Telegram["Telegram Chat"]
        WebUI["Front-End Website"]
    end

    subgraph L2 ["Package: Processing Layer"]
        Backend["Backend Server\n(APIs & Bot Management)"]
        MCPServer["MCP Server\n(Context & Tool Protocols)"]
    end

    subgraph L6 ["Package: Database Layer"]
        DB[("PostgreSQL / Relational DB")]
    end

    subgraph L3 ["Package: AI Interface Layer"]
        ChatLoop["Chat Loop\n(Orchestrator / Context Pipeline)"]
    end

    subgraph L4 ["Package: AI Workload Layer"]
        Agents["Workflows & Agents\n(Task Execution / Planning)"]
    end

    subgraph L5 ["Package: AI Base Layer"]
        Claude["Claude API"]
        Gemini["Gemini API"]
        LocalLLM["Local Model\n(e.g., Ollama / vLLM)"]
    end

    %% Edge Connections & Interfaces
    Discord -->|Events / Webhooks| Backend
    Telegram -->|Events / Webhooks| Backend
    WebUI -->|REST / WebSocket| Backend

    Backend <-->|Read / Write State| DB
    Backend -. Sub-system / Embeds .-> MCPServer

    Backend -->|Initiates Interaction| ChatLoop
    ChatLoop -->|Invokes| Agents
    
    MCPServer <-->|Exposes Tools & Resources| Agents

    Agents -->|Inference Call| Claude
    Agents -->|Inference Call| Gemini
    Agents -->|Inference Call| LocalLLM
````

| **Layer**             | **Component(s)**            | **Primary Responsibility**                                                                                                                             | **Key Interactions**                                                |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **1. Input / Output** | Discord, Telegram, Web      | Client-facing channels receiving user input and displaying system outputs.                                                                             | Sends user events to the Backend Server.                            |
| **2. Processing**     | Backend Server, MCP Server  | Handles application business logic, session management, and routing. Serves as the MCP (Model Context Protocol) host/server to supply tools to agents. | Reads/writes to DB; triggers the AI Interface Layer.                |
| **3. Database**       | PostgreSQL / SQL            | Persistent storage for user profiles, conversation history, and configuration state.                                                                   | Interacts directly with the Backend Processing layer.               |
| **4. AI Interface**   | Chat Loop                   | Orchestrates conversation turns, maintains active context windows, and handles streaming responses.                                                    | Invoked by Backend; controls the execution of AI Workloads.         |
| **5. AI Workload**    | Workflows & Agents          | Executes reasoning loops, multi-step chains, and tool usage (e.g., ReAct agents).                                                                      | Consumes tools via MCP Server; dispatches prompts to AI Base Layer. |
| **6. AI Base**        | Claude, Gemini, Local Model | Standardized abstraction layer for LLM providers (API wrappers or local endpoints).                                                                    | Processes raw prompts and returns completions to Workloads.         |

![[UML_sequence_diagram.png]]

Need to include an eval layer
- Offline, i.e. not for live requests
- Meant to ensure prompts are hitting certain quality scores during eval
- Eval will use Claude Batch API
- Start with 1,000 samples
- Mainly part of the devops pipeline to ensure changes to prompts or models keep system performant