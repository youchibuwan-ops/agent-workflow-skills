---
name: crafting-reference-based-svg-assets
description: Use when hand-authoring, refining, or visually reviewing editable SVG game props based on real objects, especially when proportions, contours, thickness, orientation, connections, or assembly are unclear. Not for abstract icons, pure UI layout, or gameplay tests.
license: MIT
compatibility: Requires file access, actual image inspection and an SVG renderer. Full multi-part production uses the bundled Python 3.10+ standard-library receipt checker. No mandatory image-generation service.
---

# 实物 SVG：集体、个体整体、局部逐层核实

完成用户的素材，同时留下能核对的实际制作顺序。先读当前用户/项目约束，保留停止点、来源许可、已有核心造型及授权边界。**读取 Skill、采用部分方法、产物可运行、完整执行流程是四件不同的事。**

## 先选择当前任务的模式

| 可观察的任务范围 | 实际执行 |
| --- | --- |
| 只读研究或只读审核 | 只做授权的参考/基准或审核；不生成制作通过记录 |
| 用户给出精确源和唯一小改动，例如只替换一个指定色值 | 直接编辑并核实际差异；不建立局部制作流程，不声称完整流程已执行 |
| 新建或实质修改实物素材、含实物构件的幻想组合、动画 SVG/HTML | 执行下面的制作循环；幻想姿态可创作，但不能因此跳过构件、接点、局部审核。先静态结构，再动画与页面装饰 |

能力不足时先匹配已装 Skill；新专业缺口或重复失误时用可用的 `proactive-skill-discovery` 查成熟方案、来源/许可和适配边界，再实际使用。不是每次改坐标都重新搜索。

## 制作循环：下一动作由当前证据决定

制作前读[结构、参考、颜色和审核判据](references/construction-and-review.md)及[分层图审与 v2 回执](references/inspection-evidence.md)。**每层都实际对照参考、比例和细节：完整范围 → 逐区域放大 → 用途尺寸；整图缩略图不能放行。** 有必改或关键证据缺失就继续补证据/返工，不向下推进。检查器核登记层级、顺序、文件版本与证据覆盖，实际看图和判断仍须由操作记录核对。

**按“集体 → 个体（整体）→ 局部”展开，按“局部 → 个体（整体）→ 集体”复核。** 集体是所有物体及其关系，个体整体是某一完整物体的外形、比例和内部布局，局部是它的具体部位；复杂物体不能整体挂一个局部 ID 就算拆分。多物体任务先走[多物体组合流程](references/construction-and-review.md#多物体组合先清点对象再逐物体完成最后审关系)：粗构图确定集体关系，再对当前个体执行下面的循环；全部个体通过后才精修组合并审核关系。单物体任务保留个体整体与局部两层。

1. **参考 → 个体整体基准。** 实际打开适用参考，先用无装饰的完整轮廓/构造图核当前个体的长宽比、轮廓转折、负空间、部件大小和相对位置；依据、端点和具体差异记入[比例对照](references/execution-record.md#个体整体基准与局部拆分)。自行设定坐标、接点对齐或参考/成品各自撑满框都不能证明比例正确。个体整体未成立先修基准，不开始局部精绘；成立后按结构与可独立出错的部位列全局部及重复实例，保留共用尺度和连续关系。已有参考充分就复用，不凑图数。
2. **初始化层级。** 按下方规范写集体中的个体/局部 `hierarchy.json` 和短 `plan.md`，初始化 v2。实际核集体构图并记录 `plan`，再为当前个体输出无装饰完整构造 SVG、实际对照并记录 `basis`；之后才进入它的局部循环。已有目录用 `next` 恢复；v1 只保留历史，不能当作 v2 通过。修订层级要保留旧失败并明确关联新修订，不能抹掉记录。
3. **只制作当前局部。** 输出共同坐标下的独立 `geometry.svg` 和渲染 PNG，实际打开、核结构，再记录 `geometry`。随后另存本局部材质源 `part.svg`，渲染、看图、记录 `material`。保留几何稿，不能改写它。
4. **审当前局部和邻接。** 对当前 `part.svg` 实际看独立图、邻接、同比参考与用途尺寸浅/深底；给出具体观察。无必改才记录 `review`，再取 `next` 的下一局部。有必改就 `rewind` 到最早受影响阶段，修源、重导、重看；旧回执保留而不再有效。
5. **全部局部后才回装。** 保持共同尺寸、颜色、坐标和实体连续，输出当前整件并实际看图，记录 `assembly`。回装改了局部就退回它，不用旧通过放行。动画再核关键相位的接触、遮挡与运动；页面按钮和排版不能取代局部制作。
6. **个体复审 → 集体复审 → 交付。** 个体回装后重新核完整周界、比例、全部局部、接点与用途视图，无必改才记录 `whole`、进入下一个体。全部个体通过后记录组合 `compose`，逐对象/接口核集体比例、细节和动画，再记录 `final`、运行 v2 `check`。有可用且获准的独立复审时执行；结论同时说明回执结果、真实看图范围和未验证项。

首次写精修整图前，应已有 `plan` 和当前局部动作；首次写回装整件前，应已有每个局部的 `review`。**先画完再拆成局部、事后批量填记录，不能恢复正确的制作顺序。** 发现已走错时保留旧稿为失败草稿，从最早缺失阶段实际重做，不能补签。

## 检查器的用法

以下 `SCRIPT` 指安装目录下的 `scripts/workflow.py`。每阶段都需要包含真实参考/完整图/细节图/用途尺寸图、比例及细节逐项比较的 inspection JSON；字段、阶段和覆盖要求见[完整规范](references/inspection-evidence.md)。所有制作源、层级和报告放在回执目录外。

```sh
python SCRIPT init review/workflow-v2 --manifest hierarchy.json
python SCRIPT record review/workflow-v2 --stage plan --source plan.md --inspection review/scene-plan.json --note "实际集体参考、比例和接口对照"
python SCRIPT next review/workflow-v2
python SCRIPT record review/workflow-v2 --stage basis --item sign --source sign/basis.svg --inspection review/sign-basis.json --note "实际个体整体轮廓、比例和内部布局对照"
python SCRIPT next review/workflow-v2
```

按 `next` 对当前个体的各局部执行 geometry/material/review，再 assembly/whole；前者 item 指局部，后者指个体。所有个体结束才 compose/final，不带 item。whole 必须使用对应 assembly 的源，final 必须使用 compose 的源。每阶段都传当前源、独立的 inspection 报告和具体 note，不补签。

```sh
python SCRIPT rewind review/workflow-v2 --stage geometry --item sign-face --reason "具体缺陷及其影响"
python SCRIPT check review/workflow-v2 --require-profile hierarchy-v2
```

`check` 在缺步骤或源/证据变更时返回非零，并给出最早缺口；回执历史与内容快照保留。它不启动联网、安装、模型调用或修改源文件；初始化会创建指定目录，record/rewind 只写该目录。

`receipts_complete` **只表示回执结构与当前文件一致**，不证明画质、真实开图或模型没有绕过工具。语义检查按[执行记录](references/execution-record.md)；缺口继续补实际工作，不用一个机械通过替代。Python 不可用时先寻找现有可用解释器或说明具体阻塞，不改写检查器或伪造通过。用户中止/预算截止时保存未完成状态，不能无限重试。

## 恢复与收尾时只回答可核事实

- `next` 给出的当前阶段、局部、具体缺口和下一实际动作是什么？源或图变了，就从失效阶段重验。
- 本次完整流程有哪些实际源/图、查看记录和回装证据？只做过若干方法时明确写“部分方法”，不当作完整 Skill 测试。
- 有未解决必改时继续修；确需外部输入时说明已经查过什么、最小缺口和可独立推进部分。不能用“你看哪里还需要改”代替自审。

复杂材料判读用[视觉诊断](references/visual-diagnosis.md)；项目特定规则放[项目配置](references/project-profile-example.md)。修订本 Skill 的验收要求在[详细判据](references/construction-and-review.md#修改本-skill-的验收)：保留失败、新会话实际制作与相邻简单编辑都要测；不以单次成功保证以后不出错。
