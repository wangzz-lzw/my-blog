# Spec Delta

## Purpose

定义站点提示交互的统一契约：所有需要告诉用户或向用户要决定的地方，都用同一套 Radix 弹窗呈现，并规定三种语义的返回值、主题跟随、可访问性与并发行为。

## ADDED Requirements

### Requirement: 统一的提示入口

前端 SHALL 通过 `useFeedback()` 提供的三个方法触发提示（`alert` / `confirm` / `choose`）；应用代码 MUST NOT 再调用 `window.confirm`、`window.alert`、`window.prompt`，也 MUST NOT 用内联段落充当提示。

#### Scenario: 不再出现原生弹窗
- **WHEN** 在源码中检索 `window.confirm`、`alert(`、`window.prompt`
- **THEN** 业务代码中没有任何调用点（Radix 内部实现除外）

#### Scenario: 不再出现内联提示
- **WHEN** 走完登录失败、注册失败、评论成功、资料保存、AI 摘要、后台加载失败这些路径
- **THEN** 页面正文里不再出现 `.notice` 提示段落，提示一律以弹窗形式呈现

### Requirement: alert —— 单按钮知会

`alert()` SHALL 呈现一个只有「知道了」按钮的弹窗，返回 `Promise<void>`；关闭后不向调用方传递任何选择。

#### Scenario: 展示错误
- **WHEN** 登录失败并调用 `alert({ title, description })`
- **THEN** 居中显示标题与说明，只有一个确认按钮，点击、按 Esc 或点遮罩都会关闭

#### Scenario: 关闭后可继续操作
- **WHEN** 用户关闭 alert
- **THEN** 焦点回到触发它的元素，表单仍可继续填写

### Requirement: confirm —— 双按钮确认

`confirm()` SHALL 呈现确认与取消两个按钮，返回 `Promise<boolean>`：确认返回 `true`，取消、按 Esc 或点遮罩返回 `false`。

#### Scenario: 删除前确认
- **WHEN** 管理员在评论管理里点「删除」
- **THEN** 先出现确认弹窗，标题说明将删除哪条评论，正文说明不可撤销；点「删除」才真正请求接口

#### Scenario: 取消不产生副作用
- **WHEN** 用户在确认弹窗里点「取消」或按 Esc
- **THEN** 返回 `false`，不发出任何请求，列表保持不变

#### Scenario: 危险操作默认停在安全选项
- **WHEN** 打开一个删除类确认弹窗
- **THEN** 初始焦点落在「取消」而不是「删除」，避免回车误删

### Requirement: choose —— 多按钮选择

`choose()` SHALL 支持两个以上选项，每个选项带标签与值，返回 `Promise<string | null>`；返回被点选的 `value`，取消、按 Esc 或点遮罩返回 `null`。

#### Scenario: 导入 Markdown 时的三选一
- **WHEN** 编辑器里已有内容时导入 Markdown 文件
- **THEN** 弹窗提供「替换」「追加到末尾」「取消」三个出口，分别返回 `"replace"`、`"append"`、`null`

#### Scenario: 选择结果驱动后续行为
- **WHEN** 用户点「追加到末尾」
- **THEN** 正文追加、元信息只补空字段，与既有导入契约一致

### Requirement: 主题与语言跟随

弹窗外观 SHALL 跟随当前主题：深色五套使用 Radix 的 dark appearance，`daylight` 使用 light appearance，强调色与主题主色对应；切换主题后新弹窗立即呈现新外观。

#### Scenario: 深色主题下的弹窗
- **WHEN** 站点处于「赛博青」并触发确认弹窗
- **THEN** 弹窗为深色底、青色强调，与页面其余部分不是两套观感

#### Scenario: 切到亮色主题后
- **WHEN** 切换到「晨光白」后再触发任一弹窗
- **THEN** 弹窗为浅色底，不残留深色背景

### Requirement: 可访问性

弹窗 MUST 具备对话框语义与键盘可用性：打开时焦点进入弹窗、Tab 在弹窗内循环、Esc 关闭、关闭后焦点归还触发元素；标题与说明被辅助技术关联。

#### Scenario: 键盘全程可用
- **WHEN** 只使用键盘触发弹窗
- **THEN** 焦点自动进入弹窗，Tab/Shift+Tab 不逃出弹窗，Esc 关闭后焦点回到原来的按钮

#### Scenario: 语义正确
- **WHEN** 屏幕阅读器读取弹窗
- **THEN** 能读到标题与说明，确认类弹窗被识别为需要立即回应的对话框

### Requirement: 并发与排队

同一时刻 SHALL 只显示一个弹窗；在上一个未关闭时触发的请求进入先进先出队列，依次呈现，不得相互覆盖或丢失。

#### Scenario: 连续触发两次提示
- **WHEN** 快速连续触发两个 `alert`
- **THEN** 先显示第一个，关闭后自动显示第二个，两次调用各自的 Promise 都按序完成

### Requirement: 窄屏不溢出

视口宽度不超过 720px 时，弹窗 MUST 完整落在视口内，按钮可换行堆叠，不出现横向滚动。

#### Scenario: 手机上的长文案弹窗
- **WHEN** 在 390px 宽视口弹出带长说明的确认弹窗
- **THEN** 弹窗宽度不超过视口，正文可读，两个按钮不重叠，可正常确认或取消