# Installing the skill

This directory is the source of truth for the `peel-mcp` skill. Copy it where Claude
Code looks for skills:

```bash
# Windows
xcopy /E /I /Y skill "%USERPROFILE%\.claude\skills\peel-mcp"

# macOS / Linux
cp -r skill/ ~/.claude/skills/peel-mcp/
```

Then invoke it with `/peel-mcp`, or just describe the job — "score this design
system", "is this agentic", "make this agent-ready".

The skill drives the engine in this repository. It finds the app automatically in
`~/Downloads/peel final`; set `PEEL_HOME` if it lives elsewhere.
