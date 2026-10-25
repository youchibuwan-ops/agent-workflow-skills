Skill工作流 · Codex + DeepSeek Harness 在线测试包

这是独立受控入口预览版，供测试阶段检查和跳步拦截。
适用范围：当前完整Skill/资源读取、原样安装读回、参考读取、选择权限、受控文件写入、现有独立验证器和学习结论。
当前验证器支持json-export、exact-text。能力缺失会明确拒绝，不开放原始shell兜底。
通用外网Skill/参考获取、任意Python方法执行、必须修改Skill的独立行为验收尚未完成接入。
本包不替换Codex日常桌面，不宣称所有对话/任务都已host_guarded，也不证明美术或所有事实判断正确。

怎么使用
1. 将ZIP完整解压到普通目录，先核对发布处整包SHA256。
2. 双击“安装.cmd”。首次需联网；只安装到个人AppData/Local/AgentWorkflowPreview。
   没有可用Node>=24.9时，仅从nodejs.org下载固定Node24.22.1 Windows x64并核SHA256。
   本包不带账号、API Key、私人报告或Codex专有应用程序。
   npm按两个锁文件安装；同一依赖锁版本只保留一份SDK，更新小版本不重复复制。
   DSH按官方plugin add安装到独立profile。请预留约2 GB空间。
3. 双击“DSH测试.cmd”或“Codex测试.cmd”。默认先跑零模型预检。
   只有预检通过后输入RUN，才会启动真实模型请求；可能产生模型费用。
   不要向其他人发送你的Key或auth.json。
4. 测完双击“导出报告.cmd”，只导出状态和计数；先看内容再交给测试负责人。

两种测试题
内置题：随机生成当前input.json，只允许写output.json，宿主独立重算generation、总和和原始字节SHA256。
该题使用预置本地Skill和参考，是门禁回归夹具，不冒充已完成GitHub专业技能搜索。
自备题：提供真实任务目录、外部原始请求文件和外部可信contract JSON。
合同必须预置当前本地catalog、至少两份references、要求和支持的validators；不提供会被拒绝。
具体配置参见hosts/core/workflow-host.test.mjs和packaging/demo.mjs。

DSH条件
需要当前进程环境变量DEEPSEEK_API_KEY。正常测试选择deepseek-flash。
零模型预检不要求Key、不创建Agent；正常运行有请求数/超时上限。
独立DSH home/profile不会覆盖你的普通DSH配置。
当前DSH单轮CLI若遇到必须人工选择或反馈，会等待退出而非跳过；该CLI尚不恢复已有运行状态。
完整跑通内置题使用人类事先锁定方案和委托技术验证的合同，不冒充已取得其他任务的选择或认可。

Codex条件
需要你已有且支持的codex-cli 0.164.0-alpha.11.1可执行文件、models_cache.json和现有登录auth.json。
不支持的版本会明确拒绝。这里通过独立WS代理调用真实app-server，不切换当前桌面。
当前桌面会话恢复等兼容性仍未完成验收，不要把这个入口改成全局桌面入口。
登录只在真实运行时临时复制到私有state，并在结束清除；不会写进安装包或共享报告。

只安装Skill
双击“仅安装Skill.cmd”。会安装两个完整Skill到个人Codex/DSH目录，已存在的同名修改先备份。
其他Skill和配置保持原样。单独安装Skill仍是instruction_only；受控host需从上述测试入口启动。

完整性与隐私
manifest.json覆盖全部发行资源。缺文件、修改字节、未列出的文件和越界路径均拒绝安装。
SHA清单检测遗漏/损坏，不能代替可信下载来源和发布处整包SHA256校验。
安装后每次启动复核源码，运行时依赖锁版本；原始任务、来源与RPC只留在你本机私有runs目录。
“导出报告.cmd”不会打包这些原始内容，不会上传任何东西。
CMD仅给本次PowerShell进程传执行策略参数，不改机器全局策略；不注册服务、启动项或全局桌面路由。

维护依据
Node官方校验清单：https://nodejs.org/dist/v24.22.1/SHASUMS256.txt
.NET ZIP解压：https://learn.microsoft.com/en-us/dotnet/api/system.io.compression.zipfile.extracttodirectory
ZIP规范：https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
