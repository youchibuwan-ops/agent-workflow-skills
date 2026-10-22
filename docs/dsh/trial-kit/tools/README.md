# Offline CSV verification / 离线 CSV 验证

Windows only. Uses Windows PowerShell 5.1 and .NET included with Windows. No Python,
Node, Git, downloads or DSH access. Run the CMD entry point from either PowerShell
version; it isolates inherited module paths locally.

Before the model task, create an evidence folder **outside** the model task folder:

```powershell
.\docs\dsh\trial-kit\tools\CSV-Check.cmd Snapshot "C:\test\csv-task" "C:\test\evidence\csv-before.json"
```

After the task, independently verify the submitted summary:

```powershell
.\docs\dsh\trial-kit\tools\CSV-Check.cmd Verify "C:\test\csv-task" "C:\test\evidence\csv-before.json"
```

Both input files (`orders.csv`, `rules.txt`) must exist. Snapshot refuses to overwrite
an existing baseline. Verify requires that baseline, independently recomputes all
seven values, accepts numerically equal `185` / `185.00`, checks header and row/field
counts, rejects changed inputs and returns **1 on failure, 0 on success**. Malformed
command arguments can return another nonzero code. Always retain output and exit code.

This checker implements only the supplied `discovery-project/rules.txt` contract;
an unknown rules file is refused. It does not verify prose audit quality, Skill use,
SVGs or Desktop behavior. It never writes task inputs, summary, DSH data or credentials.
The only created file is the explicitly requested snapshot.

中文：先 Snapshot 留任务开始前的指纹，再 Verify。请把 baseline 放在模型任务目录之外，
不要把旧结果或验证脚本当任务输入给模型；评分应在任务结束后进行。没有任务前指纹时，
如实记“任务全程输入完整性未验证”，不能事后补建来冒充历史证据。baseline 是本地记录，
不是防篡改签名，也不能证明两次取样之间从未发生修改后恢复。

查看结果必须同时看 `VERIFY_RESULT` 和退出码；旧同学脚本会输出 FAIL 却返回0，
请保留该旧文件与失败记录，用本目录新版工具进行 run-02。不要覆盖旧证据。

Developer regression: `powershell.exe -NoProfile -File tests/dsh-csv.ps1` and
`pwsh.exe -NoProfile -File tests/dsh-csv.ps1`. These invoke the real CMD/child process,
not mocked output. They do not require or launch Desktop.
