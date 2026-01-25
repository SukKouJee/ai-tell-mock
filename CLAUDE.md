# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a crewAI multi-agent system project. It uses the crewAI framework to orchestrate AI agents that collaborate on tasks.

## Commands

Install dependencies:
```bash
crewai install
```

Run the crew:
```bash
crewai run
```

Train the crew:
```bash
train <n_iterations> <filename>
```

Replay from a specific task:
```bash
replay <task_id>
```

Test the crew:
```bash
test <n_iterations> <eval_llm>
```

## Architecture

**Core Components:**
- `src/ai_tell_mook/crew.py` - Defines the `AiTellMook` crew class with `@CrewBase` decorator. Contains agent and task definitions using `@agent` and `@task` decorators.
- `src/ai_tell_mook/main.py` - Entry points for run, train, replay, test, and run_with_trigger commands.
- `src/ai_tell_mook/tools/custom_tool.py` - Template for creating custom tools that extend `BaseTool`.

**Configuration (YAML-driven):**
- `src/ai_tell_mook/config/agents.yaml` - Agent definitions (role, goal, backstory). Supports `{topic}` variable interpolation.
- `src/ai_tell_mook/config/tasks.yaml` - Task definitions (description, expected_output, assigned agent). Supports `{topic}` and `{current_year}` interpolation.

**Execution Flow:**
1. `main.py` creates input dict with variables like `topic` and `current_year`
2. `AiTellMook().crew().kickoff(inputs=inputs)` starts execution
3. Crew runs tasks sequentially (Process.sequential) with agents defined in YAML configs
4. Output is written to `report.md`

## Environment

Requires `OPENAI_API_KEY` in `.env` file.

Python version: >=3.10, <3.14
