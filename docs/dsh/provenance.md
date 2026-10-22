# 版本溯源 / Distribution provenance

## 中文

当前分发版本为 `0.1.0-dsh-preview.3`。原两份 Skill 正文、references、许可证与 agents
文件继续使用 `c1434f04704938774eb359053aaafdf38ee90868` 的原始内容。

| 标识 | 含义 | 如何核对 |
| --- | --- | --- |
| 清单/收据 `version` | DSH 分发版本，涵盖安装器和文档的版本号；当前 preview.3 | 新包清单、安装输出、安装收据应一致。 |
| `sourceCommit`，角色 `skill-content-baseline` | 只标识原始 Skill 内容基准；不是 ZIP 的下载提交 | 对比该提交下的 `skills/`，再核每个文件 SHA-256。 |
| 新收据 `manifestSha256` | 安装时原始 `dsh-manifest.json` 文件的 SHA-256 | 用同一个下载包的清单字节计算并比较；序列化或换行变化也会改变摘要。 |
| GitHub ZIP URL 中的完整 commit | 整个仓库快照，含安装器、文档和测试 | 记录实际下载链接/commit，避免只记录会移动的分支名。 |
| ZIP SHA-256 | 下载的整个压缩包字节 | 与对应测试报告或随包 `.sha256` 比较，不能拿清单摘要替代。 |

因此内容基准仍是 `c1434f0…`，而下载提交可以是另一个 commit。这是两个范围的标识。
新清单/收据加入角色说明，安装窗口也明确标注；不把内容基准伪写成包含后续安装器的提交。

收据只绑定分发版本、清单摘要和已安装 Skill 文件清单，不记录整个 ZIP 的自校验值，也不单独
证明安装器字节或下载来源可信。整包提交与 ZIP 摘要须在包外记录；将 ZIP 自身哈希塞入它自身
会造成循环。GitHub 生成的源码 ZIP 与维护者构建的扁平 ZIP 即便内容等价，也可能有不同 ZIP 摘要。

preview.1 的旧收据只有版本和内容基准，没有清单摘要。新管理器仍接受其原有所有权/文件核查，
Check 会提示“Legacy receipt”；使用新包 Update 后记录新版本及新清单摘要。
旧收据不能补写为“当时记录过摘要”，历史测试报告也不改写成新版本结果。

正常脚本安装的预期文件数：发现类5个源文件 + SVG类6个源文件 + 两份安装收据 = **13个文件**。
手动复制两份仅有11个源文件。此计数不代替逐文件哈希，也不替缺失的同学原始记录补证。

## English

`version` identifies the DSH distribution (currently preview.3). `sourceCommit`
identifies only the unchanged original Skill content baseline, not the source ZIP's
repository revision. Their roles are explicit in the new manifest/receipts and output.

New receipts record `manifestSha256`, the hash of the exact manifest bytes used for
installation. This is not the archive checksum or a claim that installer bytes are
authenticated. Record the full GitHub download commit and ZIP SHA-256 separately.
Source ZIPs and maintainer-built flat ZIPs may have different checksums.

Legacy preview.1 receipts remain supported after the existing ownership/inventory
checks; Update records current provenance. Historical reports and missing evidence
are never relabeled as current passes. A managed two-skill install has 11 payload files
plus two receipts (13 total); manual copies contain only the 11 original files.
