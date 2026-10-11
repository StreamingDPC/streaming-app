' Iniciar Bot Local de Streaming DPC en Segundo Plano (Sin ventana visible)
Set WshShell = CreateObject("WScript.Shell")
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c """ & strDir & "\Iniciar_Bot_Local.bat""", 0, False
