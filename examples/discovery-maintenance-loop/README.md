# 可运行示例：把导出复核经验写回 Skill

这是公开的受控合成夹具，实际执行过读取、失败复现、领域 Skill 修订和复验。
它验证一个明确的数据契约，不是游戏美术成果，也不证明通用模型质量提升。
所有数据与检查脚本由本项目提供，按仓库 MIT 许可分发。

## 输入与旧方法

当前源是[source.json](source.json)。[旧 Skill](before-SKILL.md)按文件名字典序选择
最后的导出，并只看金额。三个候选刻意分离“来源一致”与“内容一致”：

| 候选 | 内容 | 结果 |
| --- | --- | --- |
| [a_ready.json](exports/a_ready.json) | 来源与金额均匹配 | 通过 |
| [z_latest.json](exports/z_latest.json) | 金额匹配，来源批次过时 | 拒绝 |
| [same_generation_bad_data.json](exports/same_generation_bad_data.json) | 来源批次匹配，金额错误 | 拒绝 |

## 实际维护

执行者读取输入并运行现有验证器，复现旧规则选择过时导出的错误，然后实际修订了
[领域 Skill](skills/export-review/SKILL.md)：来源身份和所需载荷字段分别核验，
按显式路径检查每个候选，只交付全部要求通过的文件。

这不是只写了一段经验日志；领域 Skill 的后续执行步骤已改变。修改后的方法既拒绝
过时身份，也拒绝“身份正确但金额错误”的相邻反例。执行中保留了源、导出和验证器。

## 自己运行

在本目录，用 Python 3 运行：

```sh
python verify.py exports/a_ready.json
python verify.py exports/z_latest.json
python verify.py exports/same_generation_bad_data.json
```

预期退出码依次为0、1、1；后两个失败是刻意的反例，不是测试异常。
当前复验的机器可读结果见[evidence.json](evidence.json)。

## 经验如何复用

复用的判断是“导出身份和载荷均须对照当前源”，不是记住某个文件名或本例批次。
新任务仍要确认其真实字段与验收契约。若领域 Skill 已覆盖该方法，就更新既有 Skill；
形成独立通用能力且无合适归属时再新建，不为增加数量复制一份相同 Skill。
