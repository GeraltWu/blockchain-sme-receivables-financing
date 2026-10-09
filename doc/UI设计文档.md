# SME Receivables Financing DApp UI 实现说明

> 本文描述当前代码已经实现的界面，不扩展《设计文档》的目标范围。界面语言为 English，网络为 Ethereum Sepolia，结算资产为 Sepolia test ETH。

## 1. UI 架构

- 技术栈：React、TypeScript、Vite、Mantine、Ethers.js 6。
- 主要导航：`Home`、`Activity`、`Transactions`、`Profile`。
- `Profile → Manage` 进入角色申请和 Admin 审批页面。
- `Activity` 根据当前角色显示 `Invoices`、`Financing`、`Disputes` 或 `Audit`。
- 前端通过 MetaMask 和 Ethers.js 直接读取、写入五个合约；业务状态以链上数据为准。
- 当前没有后端事件索引或业务状态镜像。Audit 的事件时间线由浏览器实时扫描五个合约的事件日志。

## 2. 钱包、登录与角色

### 2.1 钱包与登录是两件事

- 连接 MetaMask 后即可读取链上数据、签名并提交合约交易。
- `Sign in` 是后端钱包签名登录，不产生链上交易。
- 登录后才能保存或读取发票编号等链下元数据，也才能查看后端保存的已验证交易记录。
- 切换 MetaMask 账户后，原账户的登录会话会被清除；如需显示发票编号，应以新账户重新登录。

### 2.2 角色选择

顶部角色列表包含：`Supplier`、`Buyer`、`Funder`、`Auditor`、`Arbitrator`、`Admin`。

- 绿点：该钱包的角色已激活。
- 红点：该角色未激活；已连接钱包时不能切入无权限视图。
- 同一钱包可以拥有多个角色，切换角色只改变当前工作视图，不改变合约权限。
- Admin 是合约配置的管理员地址，不通过普通角色申请获得。

`Profile → Manage` 中，普通参与者可点击 `Request role`；Admin 可在 `Pending requests` 中批准申请，也可在 `Active participant roles` 中撤销角色。

## 3. 已实现页面

| 页面 | 当前实现 |
|---|---|
| `Home` | 当前角色的待办、业务摘要和最近交易入口 |
| `Activity → Invoices` | 建票、Buyer 确认/拒绝、查看发票状态与链下编号 |
| `Activity → Financing` | 发起融资、报价、接收报价、放款、还款、逾期与违约处理 |
| `Activity → Disputes` | 发起争议、提交证据哈希、查看冻结状态、Arbitrator 裁决 |
| `Activity → Audit` | 状态汇总、资金流卡片、五个合约的链上事件时间线 |
| `Transactions` | 当前浏览器会话中的交易，以及登录后由后端保存的已验证交易 |
| `Profile` | 钱包、网络、余额、登录状态、角色状态和角色管理入口 |
| `Roles` | 角色申请、Admin 批准和撤销 |

## 4. 发票与融资界面

### 4.1 创建和确认发票

Supplier 在 `Activity → Invoices` 点击 `Create invoice`，填写：

- Buyer wallet
- Invoice number
- Face value
- Issue date
- Due date
- Document hash（可选；留空时前端生成演示用哈希）

提交时先写入链上发票，再由后端把 `Invoice number` 等元数据绑定到链上 invoice ID。Buyer 在自己的 `Invoices` 列表中执行 `Confirm` 或 `Reject`。

链上不保存文件，也没有文件上传或下载界面。`Document hash` 只是 `bytes32` 摘要。

### 4.2 融资动作

界面根据角色和当前状态显示以下动作：

- Supplier：`Request financing`、`Accept offer`、`Cancel`。
- Funder：`Submit offer`、`Withdraw offer`、`Fund`。
- Buyer：`Repay`。
- 符合时间和状态条件的参与者：`Expire`、`Mark overdue`、`Declare default`。

放款与还款都使用 Sepolia test ETH。弹窗展示动作、目标合约、ETH 金额和交易后果，再调用 MetaMask 确认。

## 5. 争议与托管界面

Supplier、Buyer 或本次融资的 Funder 可在符合条件的非终态发票上打开争议。用户输入的争议原因和证据说明会在浏览器中计算为 Keccak-256 哈希，合约只保存哈希，不保存原文或文件。

争议页面展示：

- dispute ID、invoice ID、发起人、阶段和冻结状态；
- reason hash；
- 每条 evidence hash、提交人和链上时间；
- 当前状态允许的裁决按钮。

Arbitrator 能看到链上提交的哈希和提交地址，但不能从哈希还原原始说明，也没有链下证据文件可查看。演示时由提交者口头说明哈希代表的材料即可。

三种裁决为：

- `Resume`：解除冻结，继续原业务流程。
- `Cancel`：仅在 `FinancingOpen` 阶段取消融资。
- `Confirm default`：仅在 `Funded` 或 `Overdue` 阶段确认违约。

争议期间 Buyer 仍可还款，资金进入合约托管，状态显示 `Repayment deposited`。若 Arbitrator 选择 `Resume`，当前 UI 会继续调用结算，使托管资金按正常规则分配。

## 6. Audit 界面

Audit 仅对已激活的 Auditor 角色开放，页面是只读的：

- Overview：发票和融资状态汇总。
- Cash flow：放款、还款、Holdback、违约等资金数据。
- Event timeline：从 RoleRegistry、InvoiceRegistry、FinancingMarket、FinancingPool、DisputeResolution 实时读取事件。
- 支持按类别和关键词筛选，并跳转到 Etherscan 查看交易。

当前没有事件数据库镜像、导出文件或离线审计接口。首次打开 Audit 可能因 RPC 扫描而需要等待；演示前应提前打开一次页面完成预热。

## 7. 状态显示

发票状态：`Unknown`、`Awaiting buyer`、`Rejected`、`Confirmed`、`Financing open`、`Funded`、`Repaid`、`Overdue`、`Repayment deposited`、`Defaulted`。

融资状态：`Unknown`、`Open`、`Offer accepted`、`Funded`、`Settled`、`Cancelled`、`Expired`、`Overdue`、`Defaulted`。

争议开启后，界面同时显示原业务状态与争议冻结状态。前端按钮用于减少误操作，最终权限和状态校验仍由智能合约决定。

## 8. 当前未实现范围

以下内容不应在演示中声称已经实现：

- Invoice NFT 或 tokenId；
- 发票、合同或证据文件上传和下载；
- 争议证据原文的链下存储与 Arbitrator 文件预览；
- 后端业务状态/事件镜像、后台同步任务和重组恢复；
- Audit 导出；
- 法币或稳定币结算。

不实现镜像不会阻断六分钟核心演示，因为所有关键业务状态和资金结果都直接来自链上。主要影响是首次加载和事件扫描依赖 Sepolia RPC，因此应使用稳定 RPC、只保留少量演示数据，并在录制前预热 Audit 页面。
