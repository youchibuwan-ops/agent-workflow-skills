# SVG workflow / 实物 SVG 工作流程

Use the [Skill](../skills/crafting-reference-based-svg-assets/SKILL.md) for execution.
This diagram explains its stage order; arrows represent evidence-based decisions,
not permission to mark unchecked stages complete.

The unreleased candidate makes these transitions explicit through
`scripts/workflow.py` v2: `init → scene plan → [object basis →
(geometry → material → review) per local → object assembly → object whole] per object →
scene compose → scene final → check`. `next` identifies the next incomplete step; `rewind`
invalidates affected downstream receipts while retaining history and snapshots.
Missing prerequisites or changed source bytes prevent a mechanical completion
result. The checker cannot attest actual viewing or stop an agent bypassing it;
the [actual failure and unrun behavioral regression](../evals/svg-workflow/README.md)
remain explicit. Twelve mechanical checks are not an adherence guarantee.

```mermaid
flowchart TD
    S["定位 / Scope and feedback location"] --> K["能力匹配 / Reuse suitable Skills and tools"]
    K --> R{"R · 当前范围结构证据足够？ / Evidence sufficient for scope?"}
    R -- "是 / Yes" --> B{"B · 整件结构、清单与共同基准成立？ / Whole basis ready?"}
    B -- "是 / Yes" --> P{"P · 当前独立局部几何通过？ / Local geometry passes?"}
    P -- "是 / Yes" --> M{"M · 材质通过且未破坏几何？ / Material preserves structure?"}
    M -- "是 / Yes" --> V{"V · 局部与邻接实图审核 / Local evidence passes?"}
    V -- "通过 / Yes" --> N{"还有局部？ / More locals?"}
    N -- "有 / Yes" --> P
    N -- "无 / No" --> A["A · 原样回装 / Assemble exact checked groups"]
    A --> W{"W · 当前整件新复审 / Fresh whole review passes?"}
    W -- "通过 / Yes" --> D["交付源与证据 / Deliver source and bounded evidence"]
    V -- "返工 / No" --> F["定位最早失效关卡 / Find earliest failed gate"]
    W -- "返工 / No" --> F
    R -- "否 / No" --> F
    B -- "否 / No" --> F
    P -- "否 / No" --> F
    M -- "否 / No" --> F
    F -- "参考、结构或基准 / Evidence or basis" --> R
    F -- "几何 / Geometry" --> P
    F -- "材质 / Material" --> M
    F -- "新能力缺口或重复失败 / Capability gap or repeated failure" --> K
```

Use the hierarchy **scene → whole individual object → local detail**, then review
back up from details to the whole object and scene. Before refining details, compare
the current object's unshaded full silhouette, proportions and internal layout with
applicable references. Whole-object IDs are not a substitute for meaningful local
decomposition. Keep separate instance IDs even when sources are reused. The v2
checker registers the hierarchy and requires reference/overview/detail/native-size
evidence, proportions and detail observations for every covered item before advancing.
It cannot judge decomposition or visual correctness, attest genuine viewing or reject
plausible but false observations. The v2 implementation and added tests are unrun.

层级为 **集体 → 个体（整体）→ 局部**。先定集体关系，再核当前个体完整外形和比例，
才逐局部精绘；回装后反向复核个体与集体。不能把完整手柄或整只鸟当成一个局部，
也不能把个体通过当成集体通过。单物体仍须先整体基准、后局部、再整体复审。

```mermaid
flowchart TD
    O["集体：列全个体实例与关系"] --> B["集体粗构图：投影、相对尺度、接口与运动范围"]
    B --> R["当前个体：参考与无装饰完整构造图"]
    R --> G{"个体整体外形、比例、负空间与内部布局成立？"}
    G -- "否：修基准、重新对照" --> R
    G -- "是" --> L["划分具体局部；核覆盖与衔接，不能以整物代局部"]
    L --> P["逐局部几何、材质、实际审核；失败留在本项"]
    P --> W{"回装后个体整体重新审核通过？"}
    W -- "否：定位受影响基准或局部" --> E
    W -- "是" --> N{"还有物体？"}
    N -- "有" --> R
    N -- "无" --> A["组合全部物体；逐关系核接触、承托、遮挡、比例"]
    A --> M["有动画时：关键相位、极限姿态和循环接缝"]
    M --> F{"整幅对象与关系全部满足任务？"}
    F -- "是" --> D["交付当前源、实际证据及验证边界"]
    F -- "否" --> E["定位最早缺口；撤回受影响结论"]
    E -- "集体基准" --> B
    E -- "个体整体基准" --> R
    E -- "局部" --> P
    E -- "仅组合接口" --> A
```

Within R, sparse evidence follows **observations → competing explanations → test
known structural constraints → seek discriminating evidence if needed**. Stop
searching when the current delivery is supported. If a critical ambiguity remains
and evidence is unavailable, record the minimum missing input or assumption choice;
continue independent work. This records a blocker, never a passed R gate.

R/B also applies to read-only research: number repeated instances by face and spatial
position, record what each actual view reveals or hides, then reconcile face and whole
counts. Similar projected shapes are not interchangeable instances. Zoom or seek a
discriminating view when counts conflict; listing three viewed images is not that check.
只读研究也须逐面逐位置编号、核每张实图的可见/遮挡关系，再汇总局部和整件数量。

Before each transition, inspect the actual current artifacts and record:
**version/local → action and output → reference position and observation → remaining
required corrections → next action**. A missing prerequisite blocks that arrow.
Rework includes regenerating and opening the new image; a stale screenshot or
copied pass cannot close a gate. If a render is stale, regenerate and inspect it
before deciding which stage failed.

Match installed Skills at entry. For a new capability gap or repeated failure,
use `proactive-skill-discovery` when available to inspect suitable existing
workflows before adding implementation. Check the helper's actual geometry and
audit limits; an isometric convex-solid helper or bounding-box test cannot prove
an open, nonconvex sheet correct. Reuse a verified workflow for routine edits.

开始先匹配已有 Skill；新专业缺口或同类反复失败时，先用主动发现流程查现成能力，
读源码、许可和适用边界，再薄适配并实际验证。查了/装了不等于应用，更不等于过关；
这条返工分流不会跳过当前局部的几何、材质和实图审核。

每个箭头都要核当前事实：**版本/局部 → 实际动作及产物 → 参考位置和观察 →
剩余必改 → 下一动作**。缺适用步骤、关键证据或仍有必改，就留在最早未满足关卡。
独立局部须有保留共同坐标的可编辑源，并实际看局部及邻接；只在整图上改一处、
截一张整图不能代替。全部局部完成后才回装，局部通过不能替整件通过。

References close a loop: **question → visible evidence and rejected explanations →
geometry/retention decision → actual reinspection**. For each critical local,
check longitudinal spans and transverse extent separately, including openings and
occlusion. Compare the same construction at applicable real-reference angles;
rotating a model alone adds no real-object evidence. Different specimens can
constrain common relationships without supplying interchangeable exact dimensions.
Assign reference roles per part and question. A body-dimension reference may not
resolve a handle's depth. Before modeling a spatial bend, find views that actually
distinguish it from a tilted planar construction; one-view fitting cannot do so.
Sparse evidence triggers bounded hypothesis testing, not a quota of pictures:
extract observations, test alternatives against continuity, interfaces, dimensions
and motion, then seek only the missing discriminating evidence. Keep noncritical
hidden assumptions explicit. Unresolved critical ambiguity blocks affected geometry;
report the minimum missing input and continue independent work without endless search.

参考必须形成闭环：**待判问题 → 实图依据与排除解释 → 几何修改/保留 → 同位置复看**。
长向分段、横向展开/截面、缺口和遮挡分别核；同一结构转到实际参考视角后同比对照，
不能只对齐一条轴或转几个模型角度就放行。异款比例用于排除误读，精确尺寸不能直接移植。
参考角色必须落实到部件和待判量，主体尺寸主图不自动成为手柄结构主图。先用适用
证据排除共面投影和空间弯折的歧义，不能先猜平面再靠单角度拟合自证。
资料少时依次提取确定约束、检验少量候选、只补能区分候选的证据；不凑图数，
也不机械要求三视图。非关键隐藏量可保留明确假设；关键歧义未解不能放行相关几何，
应列最小缺口并完成不受它影响的工作，不能无限搜索或假装确定。

Audit coverage and formation first, then shared dimensions/projection, continuity,
material and native-size readability. An earlier failure limits later observations;
reviewer agreement, source hashes and successful rendering do not establish visual
quality. Preserve failed iterations and test changed instructions through real actions.

先审实例覆盖与形成路径，再审共同尺寸/投影、连续接触、材质及用途尺寸。前项失败，
后项不能汇总成通过。保留失败；修规则后实际执行测试，不以复述规则验收。
有必改继续返工；用户暂停、确实需要输入/授权或外部资源时准确保留未完成状态。

See the [case record](../examples/svg-binder-clip/execution-record.md) and
[validation scopes](validation.md). Current binder r08 passed its new finite static
whole review and was accepted by the user for public display; older failures remain.
The diagram alone cannot establish a future asset's quality.
