# 分层图审与 v2 回执

完整制作使用 v2；旧 v1 回执保留为历史，不能升级为本标准通过。工具只检查登记层级、顺序、覆盖、文件版本和比较字段，不会读懂图片，也不能证明代理真的打开了图。任何实际可见缺陷优先于回执通过。不要为过检查伪造观察、改名图片或给同一缩略图做四个副本。

## 每层先对照再推进

| 当前层 | 比例与细节的实际核查 | 必须实际打开的图 |
| --- | --- | --- |
| 集体 | 对象数、相对尺度、空间布局、每个接口的接触/遮挡/运动；创作选择与事实依据分开 | 完整构图、各个体适用参考、接口放大与整体用途尺寸；动画还看关键相位 |
| 个体整体 | 完整周界、长宽比、轮廓转折/凹陷、内部部件大小与位置；逐项核到本个体的局部清单 | 无装饰整体与适用参考等比对照、关键区域放大、用途尺寸；回装后重看当前整件 |
| 局部 | 本部位的形状、尺寸/比例、厚度、连接、细节、线面遮挡和材质；同时核邻接 | 当前独立局部与参考对应位置、细节放大、含邻接的视图、用途尺寸浅/深底 |

每次准备过关时，依次 **打开适用参考 → 打开当前完整范围 → 放大本层全部待核区域逐项比较 → 回用途尺寸核可读性 → 处理差异 → 重导重看 → 记录当前证据**。整图缩略图只能核构图，不能签细节或比例通过。拼图可辅助浏览，但若某部位仍看不清，就单独打开该参考和当前部位，不能靠“整张拼图已看”放行。放大须来自当前源或有足够分辨率的参考，不能放大糊图假装增加证据。

比例对照写明共同基准和端点；等比对齐后检查未用于对齐的方向、关键转折和间距。每个必核项分别指出参考呈现什么、当前图怎样、差异是否解决；“符合”“自然”“整体不错”不构成观察。按结构和真实材料处理细节，不用装饰数量补偿比例错误。所有物体/局部/接口的覆盖由真实结构决定，不能临时减少清单让结果过关。

有必改或关键证据缺失就停在当前门槛，下一动作是补证据或返工；不进入下层、下一件、材质装饰或交付。返工后重新打开同位置、受影响邻接及上层整体。用户停止、预算截止或外部阻塞时保存未完成，不冒充通过也不无限空转。

## 登记真实层级

在回执目录外写 `hierarchy.json`。下面只是格式示例，不是任何物体的完整拆分：

```json
{
  "objects": [
    {"id": "sign", "parts": ["sign-base", "sign-face"]},
    {"id": "stand", "parts": ["stand-leg"]}
  ]
}
```

实例与局部 ID 全局唯一；复杂物体须按个体基准图继续拆分，改个名字仍不算有效拆分。单物体只列一个对象即可。层级在初始化后冻结；真实漏项需要改变层级时，保留旧目录和失败，在新修订目录重新登记，并在新计划引用旧记录及失效原因，不能把旧回执复制成新通过。

```sh
python SCRIPT init review/workflow-v2 --manifest hierarchy.json
python SCRIPT next review/workflow-v2
```

固定顺序为 `plan`（集体）→ 对每个个体依次 `basis`（个体整体）→ 各局部 `geometry → material → review` → 该个体 `assembly → whole` → 所有个体完成后 `compose → final`（集体）。单物体也保留最终用途/交付检查。`--item` 在 basis/assembly/whole 指个体 ID，在 geometry/material/review 指局部 ID；plan/compose/final 不传 item。所有源使用共同坐标基准。

## 每次过关提交实际对照

每阶段保存自己的 inspection JSON，不覆盖先前阶段的报告。`source_sha256` 必须是本次 `--source` 的真实 SHA256。`views` 路径相对报告文件，四个角色须对应不同内容的实际 PNG；可用现有渲染器转存参考格式，保留原图和出处。需要多个参考、多个局部细节或浅深底时可做清楚的对照板，但工具要求的四种图只是最低证据种类，不是审核范围上限。

```json
{
  "stage": "review",
  "item": "sign-face",
  "source_sha256": "替换为当前源的真实SHA256",
  "coverage": ["sign-face"],
  "alignment": "说明实际参考视角、对齐端点、共同尺度及适用边界",
  "views": {
    "reference": "reference-detail.png",
    "overview": "current-local-and-neighbor.png",
    "detail": "current-detail.png",
    "native": "current-native-light-dark.png"
  },
  "proportions": [
    {"target": "sign-face", "reference": "实际参考中的比例依据", "current": "当前图同一关系的观测", "finding": "具体差异及处理后复看结果", "status": "pass"}
  ],
  "details": [
    {"target": "sign-face", "reference": "实际参考中的结构或细节依据", "current": "当前图对应部位的观测", "finding": "具体差异及处理后复看结果", "status": "pass"}
  ],
  "unresolved": []
}
```

示例文字必须替换为真实观察。每项可有多条比例/细节比较，不只凑一行。`coverage` 在集体阶段覆盖全部个体，个体整体阶段覆盖它的全部局部，局部阶段覆盖该局部；比例和细节两栏都须覆盖这些 ID。plan/basis 只核当时的构图或无装饰结构依据，不宣称尚未制作的材质已完成；material 再核材质是否保持已确认几何。

集体的虚构组合没有整幅实拍时，参考角色使用各个体的适用来源及任务确定的组合构造依据，明确哪些关系是创作决定；不能把自画构图当真实形制证明。几何基准仍须使用本个体适用的实物/工程来源。无法核清的关键关系记录为 unresolved，先补证据。

```sh
python SCRIPT record review/workflow-v2 --stage review --item sign-face --source parts/sign-face/part.svg --inspection review/sign-face-review.json --note "本阶段的具体观察与返工结果"
python SCRIPT rewind review/workflow-v2 --stage geometry --item sign-face --reason "实际发现的缺陷及影响"
python SCRIPT check review/workflow-v2 --require-profile hierarchy-v2
```

未解决项、缺覆盖、缺比例/细节比较、重复图片代替不同视图、报告源哈希不符或阶段不符会阻止本次 record；旧源、图或报告发生变化会使已有回执失效。被拒绝的报告和旧稿保留，不删缺陷或改成 pass 来绕过；修源、重导并实际复看后另存新报告再提交。工具不能识别换名/伪装语义、假的观察或不合理的拆分，也不能拦截绕过工具的宿主写文件行为。最终报告分别说明机械回执、实际看图范围、未验证项；不得把 receipts_complete 当艺术质量证明。
