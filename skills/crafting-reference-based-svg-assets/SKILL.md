---
name: crafting-reference-based-svg-assets
description: Use when hand-authoring, refining, or visually reviewing editable SVG game props based on real objects, especially when proportions, contours, thickness, orientation, connections, or assembly are unclear. Not for abstract icons, pure UI layout, or gameplay tests.
license: MIT
compatibility: Requires file access, actual image inspection and an SVG renderer. Full multi-part production uses the bundled Python 3.10+ standard-library receipt checker. No mandatory image-generation service.
---

# 实物 SVG：逐局部执行，再审核整件

完成用户的素材，同时留下能核对的实际制作顺序。先读当前用户/项目约束，保留停止点、来源许可、已有核心造型及授权边界。**读取 Skill、采用部分方法、产物可运行、完整执行流程是四件不同的事。**

## 先选择当前任务的模式

| 可观察的任务范围 | 实际执行 |
| --- | --- |
| 只读研究或只读审核 | 只做授权的参考/基准或审核；不生成制作通过记录 |
| 用户给出精确源和唯一小改动，例如只替换一个指定色值 | 直接编辑并核实际差异；不建立局部制作流程，不声称完整流程已执行 |
| 新建或实质修改实物素材、含实物构件的幻想组合、动画 SVG/HTML | 执行下面的制作循环；幻想姿态可创作，但不能因此跳过构件、接点、局部审核。先静态结构，再动画与页面装饰 |

能力不足时先匹配已装 Skill；新专业缺口或重复失误时用可用的 `proactive-skill-discovery` 查成熟方案、来源/许可和适配边界，再实际使用。不是每次改坐标都重新搜索。

## 制作循环：下一动作由当前证据决定

制作前读[结构、参考、颜色和审核判据](references/construction-and-review.md)；执行时按当前阶段定位章节，不用记忆代替回查。Python 检查器只检查顺序、文件版本和依赖；实际看图与判断仍由代理完成，真实执行应由宿主工具记录核对。

**一幅图有多个不同物体时，先走[多物体组合流程](references/construction-and-review.md#多物体组合先清点对象再逐物体完成最后审关系)。** 先列物体实例和它们之间的关系；下面的局部制作循环对每个物体分别执行，单个物体整件通过后才处理下一个，全部物体通过后才精修组合并审核物体间关系。允许先用粗构图约束整体位置和接口，不允许先精修整幅再补单物体记录。一个物体通过不等于组合通过。

1. **参考 → 基准。** 实际打开能回答当前问题的参考，区分观察/创作选择/未知；多视角落实到具体轮廓、厚度、连续与遮挡。已有来源充分就复用，不凑图数。列全局部及重复实例、共同坐标/尺度、材质和连接。只画粗构造，精绘从下一步的第一个局部开始。
2. **初始化一次。** 在项目创建流程目录，用完整局部清单运行下方 `init`。写短 `plan.md`，包含上述判读、参考位置和清单；把已实际查看的参考/粗构造图作为 `plan` 证据。目录已存在就用 `next` 恢复，不能新建空目录抹掉失败。
3. **只制作当前局部。** 输出共同坐标下的独立 `geometry.svg` 和渲染 PNG，实际打开、核结构，再记录 `geometry`。随后另存本局部材质源 `part.svg`，渲染、看图、记录 `material`。保留几何稿，不能改写它。
4. **审当前局部和邻接。** 对当前 `part.svg` 实际看独立图、邻接、同比参考与用途尺寸浅/深底；给出具体观察。无必改才记录 `review`，再取 `next` 的下一局部。有必改就 `rewind` 到最早受影响阶段，修源、重导、重看；旧回执保留而不再有效。
5. **全部局部后才回装。** 保持共同尺寸、颜色、坐标和实体连续，输出当前整件并实际看图，记录 `assembly`。回装改了局部就退回它，不用旧通过放行。动画再核关键相位的接触、遮挡与运动；页面按钮和排版不能取代局部制作。
6. **新整件审核 → 交付。** 完整周界、所有局部、接点、跨局部连续、材质和用途视图重新核查；有可用且获准的独立复审时执行。修后重新核受影响项及整件，无必改才记录 `whole`，运行 `check`。结论同时说明回执结果、真实看图范围和未验证项。

首次写精修整图前，应已有 `plan` 和当前局部动作；首次写回装整件前，应已有每个局部的 `review`。**先画完再拆成局部、事后批量填记录，不能恢复正确的制作顺序。** 发现已走错时保留旧稿为失败草稿，从最早缺失阶段实际重做，不能补签。

## 检查器的用法

以下 `SCRIPT` 指安装目录下的 `scripts/workflow.py`，不要假定当前目录就是 Skill 目录。只对本任务新建的流程目录使用，所有源图放在其外，避免把回执当成制作源。

```sh
python SCRIPT init review/workflow --parts base lever
python SCRIPT record review/workflow --stage plan --source plan.md --image reference.png --note "具体的参考判读、基准与实例清单"
python SCRIPT next review/workflow
python SCRIPT record review/workflow --stage geometry --part base --source parts/base/geometry.svg --image parts/base/geometry.png --note "已打开结构图，具体轮廓与连接观察"
python SCRIPT record review/workflow --stage material --part base --source parts/base/part.svg --image parts/base/material.png --note "实际材料与几何的对应"
python SCRIPT record review/workflow --stage review --part base --source parts/base/part.svg --image parts/base/light.png --image parts/base/dark.png --note "局部、邻接和参考实际对照的结论"
python SCRIPT next review/workflow
```

按返回的 `next` 做下一项；第二局部同样经过 geometry/material/review 后，才记录 assembly/whole。后两项也使用 `--source`、一个或多个 `--image` 和具体 `--note`，不带 `--part`。whole 的 source 必须是当前 assembly 的 source。

```sh
python SCRIPT rewind review/workflow --stage geometry --part base --reason "具体缺陷及其影响"
python SCRIPT check review/workflow
```

`check` 在缺步骤或源/证据变更时返回非零，并给出最早缺口；回执历史与内容快照保留。它不启动联网、安装、模型调用或修改源文件；初始化会创建指定目录，record/rewind 只写该目录。

`receipts_complete` **只表示回执结构与当前文件一致**，不证明画质、真实开图或模型没有绕过工具。语义检查按[执行记录](references/execution-record.md)；缺口继续补实际工作，不用一个机械通过替代。Python 不可用时先寻找现有可用解释器或说明具体阻塞，不改写检查器或伪造通过。用户中止/预算截止时保存未完成状态，不能无限重试。

## 恢复与收尾时只回答可核事实

- `next` 给出的当前阶段、局部、具体缺口和下一实际动作是什么？源或图变了，就从失效阶段重验。
- 本次完整流程有哪些实际源/图、查看记录和回装证据？只做过若干方法时明确写“部分方法”，不当作完整 Skill 测试。
- 有未解决必改时继续修；确需外部输入时说明已经查过什么、最小缺口和可独立推进部分。不能用“你看哪里还需要改”代替自审。

复杂材料判读用[视觉诊断](references/visual-diagnosis.md)；项目特定规则放[项目配置](references/project-profile-example.md)。修订本 Skill 的验收要求在[详细判据](references/construction-and-review.md#修改本-skill-的验收)：保留失败、新会话实际制作与相邻简单编辑都要测；不以单次成功保证以后不出错。
