@echo off
rem tick_local.cmd — wrapper untuk Task Scheduler. Menjalankan tick_local.ps1 tersembunyi,
rem mengalihkan output ke log, dan selalu mengembalikan exit code 0 agar Last Result = 0.
rem Perbaikan OPERASIONAL pasca-freeze: tidak mengubah aturan/parameter/universe.
set ROOT=C:\Users\fandy\Downloads\uas_bot\data
set LOG=%ROOT%\out\tick_task.log
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File "%ROOT%\scripts\tick_local.ps1" >> "%LOG%" 2>&1
exit /b 0
