@echo off
title Cortex UI
cd /d "d:\Documenten\Programmeren\Personal Assistant"
start "" http://localhost:8787
node --import tsx src/ui/server.ts
