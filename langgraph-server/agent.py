"""
LangGraph Agent that uses MCP Gateway tools.
This agent can be connected to agent-chat-ui.
"""
import os
import httpx
from typing import Annotated, Any
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

load_dotenv()

# MCP Gateway URL
GATEWAY_URL = os.getenv("MCP_GATEWAY_URL", "http://localhost:8080")


def call_mcp_tool(tool_name: str, arguments: dict) -> Any:
    """Call MCP Gateway tool."""
    response = httpx.post(
        f"{GATEWAY_URL}/mcp/tools/call",
        json={"tool": tool_name, "arguments": arguments},
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("error"):
        raise Exception(data.get("message", "Unknown error"))
    return data.get("result")


# Define tools that wrap MCP Gateway calls

@tool
def search_tables(query: str, limit: int = 10) -> str:
    """Search for tables by keyword in name, description, tags, or columns.

    Args:
        query: Search keyword (e.g., "STB", "품질", "quality")
        limit: Maximum number of results
    """
    result = call_mcp_tool("search_tables", {"query": query, "limit": limit})
    return str(result)


@tool
def schema_lookup(table_name: str) -> str:
    """Get detailed schema information for a table including columns, types, and descriptions.

    Args:
        table_name: Table name (e.g., "iptv.tb_stb_5min_qual")
    """
    result = call_mcp_tool("schema_lookup", {"tableName": table_name})
    return str(result)


@tool
def execute_sql(sql: str, mode: str = "limit", limit: int = 100) -> str:
    """Execute SQL query against mock database.

    Args:
        sql: SQL query to execute
        mode: Execution mode - "plan" (no data), "limit" (limited rows), "full" (all rows)
        limit: Maximum rows to return in limit mode
    """
    result = call_mcp_tool("execute_sql", {"sql": sql, "mode": mode, "limit": limit})
    return str(result)


@tool
def validate_syntax(sql: str) -> str:
    """Validate SQL syntax without executing. Returns errors and warnings.

    Args:
        sql: SQL query to validate
    """
    result = call_mcp_tool("validate_syntax", {"sql": sql})
    return str(result)


@tool
def get_lineage(dataset_urn: str, direction: str = "both", depth: int = 1) -> str:
    """Get upstream and/or downstream lineage for a dataset.

    Args:
        dataset_urn: Dataset URN or table name (e.g., "iptv.tb_stb_5min_qual")
        direction: "upstream", "downstream", or "both"
        depth: How many levels of lineage to traverse (1-5)
    """
    result = call_mcp_tool("get_lineage", {
        "datasetUrn": dataset_urn,
        "direction": direction,
        "depth": depth,
    })
    return str(result)


@tool
def register_lineage(source_urn: str, target_urn: str, lineage_type: str = "TRANSFORMED") -> str:
    """Register a new lineage relationship between two datasets.

    Args:
        source_urn: Source dataset URN or table name
        target_urn: Target dataset URN or table name
        lineage_type: Type of relationship - "TRANSFORMED", "DERIVED", or "COPIED"
    """
    result = call_mcp_tool("register_lineage", {
        "sourceUrn": source_urn,
        "targetUrn": target_urn,
        "type": lineage_type,
    })
    return str(result)


@tool
def generate_dag(
    dag_id: str,
    schedule: str,
    start_date: str,
    tasks: list[dict],
    description: str = "",
    catchup: bool = False,
    tags: list[str] = None,
) -> str:
    """Generate Airflow DAG Python code from configuration.

    Args:
        dag_id: Unique DAG identifier (lowercase, underscores allowed)
        schedule: Cron expression or preset (e.g., "@daily", "0 0 * * *")
        start_date: Start date in ISO format (e.g., "2024-01-01")
        tasks: List of task definitions with taskId, operator, params, dependencies
        description: Human-readable DAG description
        catchup: Whether to run backfill for missed intervals
        tags: Tags for categorizing the DAG
    """
    result = call_mcp_tool("generate_dag", {
        "dagId": dag_id,
        "description": description,
        "schedule": schedule,
        "startDate": start_date,
        "catchup": catchup,
        "tags": tags or [],
        "tasks": tasks,
    })
    return str(result)


@tool
def validate_dag(code: str) -> str:
    """Validate DAG code for common issues and best practices.

    Args:
        code: DAG Python code to validate
    """
    result = call_mcp_tool("validate_dag", {"code": code})
    return str(result)


@tool
def register_dag(dag_id: str, code: str, overwrite: bool = False) -> str:
    """Validate and save a DAG to the generated-dags directory.

    Args:
        dag_id: DAG identifier
        code: DAG Python code
        overwrite: Whether to overwrite existing DAG
    """
    result = call_mcp_tool("register_dag", {
        "dagId": dag_id,
        "code": code,
        "overwrite": overwrite,
    })
    return str(result)


@tool
def list_dags(limit: int = 50) -> str:
    """List all registered DAGs with their metadata and status.

    Args:
        limit: Maximum number of DAGs to return
    """
    result = call_mcp_tool("list_dags", {"limit": limit})
    return str(result)


@tool
def get_dag_status(dag_id: str) -> str:
    """Get detailed status of a DAG including recent run history.

    Args:
        dag_id: DAG ID to get status for
    """
    result = call_mcp_tool("get_dag_status", {"dagId": dag_id})
    return str(result)


# All tools
tools = [
    search_tables,
    schema_lookup,
    execute_sql,
    validate_syntax,
    get_lineage,
    register_lineage,
    generate_dag,
    validate_dag,
    register_dag,
    list_dags,
    get_dag_status,
]


# Define graph state
class State(TypedDict):
    messages: Annotated[list, add_messages]


# Create LLM with tools
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
llm_with_tools = llm.bind_tools(tools)


def chatbot(state: State):
    """Process messages and generate response."""
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


def should_continue(state: State):
    """Determine if we should continue to tools or end."""
    messages = state["messages"]
    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END


# Build graph
graph_builder = StateGraph(State)

# Add nodes
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_node("tools", ToolNode(tools=tools))

# Add edges
graph_builder.add_edge(START, "chatbot")
graph_builder.add_conditional_edges("chatbot", should_continue, ["tools", END])
graph_builder.add_edge("tools", "chatbot")

# Compile graph
graph = graph_builder.compile()


if __name__ == "__main__":
    # Test the agent
    print("Testing MCP Gateway Agent...")

    # Test search
    result = graph.invoke({
        "messages": [HumanMessage(content="STB 관련 테이블을 검색해줘")]
    })

    for msg in result["messages"]:
        if isinstance(msg, AIMessage):
            print(f"AI: {msg.content}")
        elif isinstance(msg, ToolMessage):
            print(f"Tool ({msg.name}): {msg.content[:200]}...")
