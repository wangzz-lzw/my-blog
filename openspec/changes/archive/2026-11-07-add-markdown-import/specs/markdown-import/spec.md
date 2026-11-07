# Spec Delta

## Purpose

让作者把手头已有的 Markdown 文件带进文章编辑器：约束可导入的文件、规定 frontmatter 与标题的解析规则、定义正文与元信息的回填顺序，以及和编辑器里已有内容的合并方式。

## ADDED Requirements

### Requirement: 导入入口与文件约束

文章编辑器（新建与编辑）SHALL 提供导入 Markdown 文件的控件；可接受 `.md`、`.markdown`、`.txt`，单个文件不超过 1MB，超出或类型不符时 MUST 给出可读原因且不改动编辑器。

#### Scenario: 选择合法文件
- **WHEN** 管理员点击导入控件并选择一个 200KB 的 `.md` 文件
- **THEN** 文件在浏览器本地被读取并进入解析流程，编辑器内容按解析结果回填

#### Scenario: 类型不符
- **WHEN** 选择了一个 `.pdf` 文件（即便手动改了扩展名使选择器显示为文本）
- **THEN** 提示只支持 Markdown 文本文件，编辑器内容与选前完全一致

#### Scenario: 超出大小上限
- **WHEN** 选择一个 2MB 的 `.md` 文件
- **THEN** 提示文件超过 1MB 上限，编辑器内容不变

#### Scenario: 不经过服务器
- **WHEN** 导入任意合法文件
- **THEN** 不产生上传接口请求，文件内容只存在于浏览器与编辑器状态中

### Requirement: 正文与元信息的解析回填

导入 SHALL 把文件正文写入正文编辑区，并按「YAML frontmatter 优先，其次文首一级标题」的顺序回填标题、slug、标签与摘要。

#### Scenario: frontmatter 全字段
- **WHEN** 文件以 `---` 包裹的 frontmatter 给出 `title`、`slug`、`excerpt`、`tags`，其后是正文
- **THEN** 对应字段被填入编辑器，正文不包含 frontmatter 块本身

#### Scenario: 只有一级标题
- **WHEN** 文件没有 frontmatter，首行是 `# 我的标题`，其后是正文
- **THEN** 标题被填为「我的标题」，正文中不再保留这行标题

#### Scenario: frontmatter 缺字段
- **WHEN** frontmatter 只给了 `title`，没有 `tags` 与 `excerpt`
- **THEN** 只回填标题，标签与摘要保持编辑器中的原值（不被清空）

#### Scenario: 没有标题
- **WHEN** 文件既无 frontmatter 也无一级标题，只有普通段落
- **THEN** 正文按原样写入，标题保持编辑器中已有的值

#### Scenario: 代码块里的分隔线不算 frontmatter
- **WHEN** 文件正文的代码块内含有 `---` 行，但文件首行不是 `---`
- **THEN** 该文件按"无 frontmatter"处理，代码块内容完整保留在正文中

### Requirement: 与已有内容的合并

编辑器已有内容（标题、正文、摘要、标签任一非空）时，导入 MUST 先让管理员选择替换、追加或取消，不得直接覆盖。

#### Scenario: 空编辑器直接写入
- **WHEN** 编辑器各字段均为空时导入文件
- **THEN** 直接回填，不弹出确认

#### Scenario: 选择替换
- **WHEN** 已有内容时导入并选择「替换」
- **THEN** 正文替换为文件正文；标题、slug、摘要、标签在文件提供值时被覆盖，未提供时保持原值

#### Scenario: 选择追加
- **WHEN** 已有内容时导入并选择「追加到末尾」
- **THEN** 文件正文以空行分隔追加到现有正文之后；元信息只回填原本为空的字段，已有值不被改写

#### Scenario: 选择取消
- **WHEN** 已有内容时导入并选择「取消」
- **THEN** 编辑器所有字段保持导入前的值，不产生任何改动

### Requirement: 原子性

导入过程中任何一步失败 MUST NOT 留下部分写入的状态；失败后编辑器内容与导入前完全一致，并给出可读的错误原因。

#### Scenario: 读取失败
- **WHEN** 浏览器读取文件时报错（如文件在选中后被移走）
- **THEN** 提示读取失败，编辑器内容不变

#### Scenario: 空文件
- **WHEN** 选中一个只含空白的文件
- **THEN** 提示文件没有可导入的内容，编辑器内容不变

### Requirement: 文本编码归一化

导入 SHALL 去掉文件开头的 BOM 并把 CRLF 统一为 LF，避免把 Windows 换行带进正文。

#### Scenario: Windows 换行文件
- **WHEN** 导入一个使用 CRLF 的 `.md` 文件
- **THEN** 编辑器中的正文只含 LF 换行，不出现字符级残留

### Requirement: 不改变发布状态

导入 MUST NOT 改变「立即发布」的勾选状态，发布仍是显式动作。

#### Scenario: 已勾选发布时导入
- **WHEN** 「立即发布」处于勾选状态时导入文件
- **THEN** 导入完成后该勾选仍为勾选，保存接口收到的 `published` 与导入前一致

#### Scenario: frontmatter 声明草稿
- **WHEN** 文件的 frontmatter 含有 `draft: true`
- **THEN** 不因该字段改变发布勾选状态（本次不解析发布相关字段）