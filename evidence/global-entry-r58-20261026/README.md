# R58 — R57 的测试等待修订

R57 已修复普通终端 PowerShell 5.1 的目录/字节读取，并在发布者真实项目的日常 Web 中通过。R58 **只修改 `hosts/dsh-global/launcher-native.test.mjs`**：新 PS5 冷启动用例的测试 RPC 等待从 15 秒改为 60 秒；原生单次读取时限、模型额度、日常配置和全部运行时/Skill 字节均未改变。具体差异由 `runtime-equivalence.json` 和检查器逐项比较两版 manifest，不靠文字声明。

R57 初次 GitHub CI 的失败原样保留：Windows 新用例在 15 秒 RPC 截止处超时；链接检查遇到尚未创建的 R57 发行页 404 和第三方图片 HTTP/2 错误。R57 发行页现已创建，没有隐藏测试或降低成功标准。R58 重新完整执行作者检查；当前数量与结果见 `summary.json`。GitHub CI 最终状态在发行附件独立记录。

R57 的 20 次真实网页工具调用、当前项目文件哈希、普通 PATH 下实际 PS5.1 进程观察，以及 18+2 项独立复审，见[原始 R57 记录](../global-entry-r57-20261026/README.md)。**R58 没有重新调用付费模型或宣称新做一轮 GUI 验收**；复用范围由除测试文件外所有 payload 成员相同的字节证据限定。实际运行的本机服务保持在已验收的 R57，未为测试时限变更重启用户服务。

新安装包位于[GitHub Releases](https://github.com/youchibuwan-ops/agent-workflow-skills/releases)。解压运行 `安装DSH.cmd`，从普通项目目录运行固定 `dsh.cmd web`，再打开终端打印的完整认证网址。不要把带 `dsh web:` 前缀的一整行当成 URL，也不要公开认证参数。账号/API Key 不随包分发，不改造 QQ 机器人。

`node evidence/global-entry-r58-20261026/verify-evidence.mjs --package <ZIP路径>` 核对源码、公开记录、运行时等价性及完整发行 ZIP。它证明字节一致，不能重演模型历史、替代真实安装或保证所有产品功能。
