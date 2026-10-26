# 能力引入、适配与经验维护

本任务延续用户对真实门禁、两宿主实测、GitHub 同步及同学安装包的授权，不修改游戏。根聊天本身为 `instruction_only`；另外的受控入口才是实际验证的 `host_guarded`。

## 能力核验单

| 需求/缺口 | 来源与固定版本 | 实际核读 | 适配和实际应用 | 安装/复用及限制 |
| --- | --- | --- | --- | --- |
| 需求拆解、先研究与先选择、实际维护 | 本仓库 proactive-skill-discovery，两宿主同源；文件身份见 source-manifest.json | SKILL、阶段检查、执行记录、适配、参考选择和学习维护引用 | 用冻结版本、真实拒绝、当前产物及反例作为阶段依据 | 两个个人目录各 10 文件已与冻结来源逐文件读回，旧版备份保留 |
| Windows 原生启动器 ABI、字符串和释放 | [dotnet/skills](https://github.com/dotnet/skills/tree/a6bf43ab61967c30919334986515163ab24d7635)，`dotnet-pinvoke` | 完整 SKILL、LICENSE、references/type-mapping.md、references/diagnostics.md；MIT | 固定原生 C# 入口与原生互操作类型；不能把不受支持的窗口 API 当作已可用 | 实际安装到个人 `dotnet-pinvoke`，SKILL SHA256 `05f8fe734ec6b010b8c3eefb28cf594123fec1ce3688cd08f4a804097237037a`；COM 另核官方文档，未冒称该 Skill 覆盖 COM |
| 写作 Skill 候选是否可通用引入 | vercel/eve 的 technical-writing，提交 `cea4eb0fa6e16aa5b54fc099705567764455de32` | 实际完整读过 9 个配套文件及根 NOTICE | 依赖 eve 内部环境，拒绝作为本任务的通用能力 | 未安装，不把检索结果计为采用 |
| 文件元数据变化与数据变化的区分 | [Microsoft FILE_BASIC_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_basic_info) | 官方字段定义；同权限原生实测记录 | ctime-only 不能直接冒充内容改变；必须有界重读、字节/身份/稳定性检查 | 不由时间戳推断某次 ACL 的确切原因；禁止直接文件内容读取作为权限拒绝的 fallback |
| Codex/DSH 调度、观察缓存、权限和 CAS | 固定 Codex CLI、DSH 0.2.1-rc.2 官方运行时实际源码；见 manifest/测试 | 实际 SessionController、工具 dispatch 和 fs observation 行为 | 先建立最小反例，再用原生读登记恢复跨 Agent 的 writer 观察；原有 baseline、CAS 与权限均保留 | 两个不同 Agent、第三轮回到原 Agent 的三次写入成功，外部改写、注册竞态、只读和许可重放反例均拒绝；独立复核不等于浏览器或付费验收 |

Codex 实际任务另采用 `doc-coauthoring` 和两份 W3C 参考。Web 实际任务仅窄化采用 Matt Pocock 的 MIT `writing-shape` 中“写前重读、只改指定片段”的方法，核 RFC 3629 与 Unicode UTF/BOM FAQ；其写文章的主流程不适用，未据此声称找到了完整的字节编辑专业 Skill。

## 实际修改并部署的经验

两套 Skill 的 `references/stage-checks.md` 已同步修改，个人安装各 10 文件精确读回。不是只写本页总结：

1. GUI 控制命令只能对识别用副本规范化 CR/LF，保留真实输入；未知或多余内容拒绝。
2. 参数、缺少新目标等可恢复业务错误与完整性、权限执行器、已知输入丢失必须分开；保留第一原因。
3. 要测实际日常 wrapper、默认解析和提供器实际默认回复上限，显式 probe 参数不代替它。
4. 独立实现期望字节转换，关联成功的原生 call ID、返回、当前产物；被拒的最后一次写不能替代成功凭证。
5. 元数据变化要有真实原生成功路径与相邻攻击反例，不能降低身份、内容和稳定性判据。
6. **同 session ID 不等于同 Agent 观察缓存**。恢复 writer 的原生观察，不得用新观察覆盖旧内容基线、把外部改写洗成许可。

行为复验包括当前 426 项完整回归、29 项 Skill/阶段测试，以及独立 10 组 executor 反例与真实跨 Agent 三轮修改。文档结构检查单独为 87 文件、零错误，不能替代行为验证。

每条小型文本测试的 `workflow_learn` 如实返回 `no_increment`，因为它们未产生领域新方法。真正的宿主经验维护由本次根任务实际修改并部署上面的 Skill 引用。默认通用控制器尚不支持自动写入 Skill：没有可信行为 validator 时，要求更新应阻断；不能用这几次 `no_increment` 宣称任意未来任务都能自主维护。
