# 当前后端 API 与数据实现

本文记录当前 Flask 后端已经实现的接口和数据范围。总体业务目标与状态机以《设计文档》为准；本文只描述当前代码，不包含尚未实现的文件服务、事件镜像或审计统计 API。

## 1. 当前架构边界

- 发票、融资、报价、放款、还款、逾期、违约和争议状态以 Sepolia 合约为唯一事实来源。
- React 前端通过 Ethers.js 直接读取合约并由 MetaMask 签署写交易。
- Flask 使用 Sepolia RPC 验证已确认交易，并提供受权限控制的链上查询接口。
- SQLite 只保存登录 Nonce、登录会话、业务发票号映射和已验证交易，不镜像完整链上业务状态。
- Auditor 的事件时间线由前端实时扫描五个合约的日志，不经过后端事件索引表。
- 当前没有文件上传、文件下载、证据原文、链下角色资料或持久化事件索引接口。

## 2. 通用约定

| 项目 | 当前约定 |
|---|---|
| Base path | `/api` |
| 网络 | Sepolia，`chainId = 11155111` |
| 结算资产 | Sepolia native ETH |
| 数据格式 | JSON，UTF-8 |
| 登录方式 | 钱包签署一次性消息，服务端返回短期 session token |
| 鉴权头 | `Authorization: Bearer <sessionToken>` |
| 金额 | wei 十进制字符串；前端负责 ETH 与 wei 的转换 |
| 地址 | 有效 EVM 地址，服务端转换为 checksum address |
| 链上 ID | JSON 中使用十进制字符串，路由参数使用十进制整数 |
| 哈希 | `0x` 前缀的 32 字节值；交易哈希长度为 66 字符 |

错误响应统一为：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Readable English message.",
    "details": {}
  }
}
```

常用状态码：`400` 输入错误、`401` 未登录或会话过期、`403` 无权限、`404` 资源不存在、`409` 配置或绑定冲突、`422` 链上交易与预期不一致、`503` RPC 不可用。

## 3. 公共接口

### `GET /api/health`

检查 Flask 和 SQLite 是否可用，无需登录。

```json
{
  "status": "ok",
  "database": "ok"
}
```

### `GET /api/config`

返回前端需要核对的网络、结算资产和五个合约地址，无需登录。

```json
{
  "chainId": 11155111,
  "settlementAsset": "native-ETH",
  "contracts": {
    "roleRegistry": "0x...",
    "invoiceRegistry": "0x...",
    "financingMarket": "0x...",
    "financingPool": "0x...",
    "disputeResolution": "0x..."
  },
  "configured": true
}
```

## 4. 钱包登录

### `POST /api/auth/nonce`

请求一次性登录消息，无需登录。

请求：

```json
{
  "address": "0x...",
  "chainId": 11155111
}
```

响应包含 `nonce`、完整 `message` 和 `expiresAt`。前端必须原样交给 MetaMask 签名。

### `POST /api/auth/verify`

验证钱包签名并创建会话。

```json
{
  "address": "0x...",
  "message": "Receivables Financing sign-in\n...",
  "signature": "0x..."
}
```

成功响应：

```json
{
  "sessionToken": "...",
  "expiresAt": "2026-10-09T16:00:00+00:00",
  "wallet": "0x..."
}
```

Nonce 只能使用一次，并必须在有效期内。服务端保存 token 的哈希，不保存明文 token。

### `GET /api/auth/me`

需要登录，返回当前 session 对应的钱包地址。

```json
{
  "wallet": "0x..."
}
```

当前没有 `/api/auth/logout`。前端 `Sign out` 只删除浏览器中的 session token；服务端记录会在过期后失效。

## 5. 发票业务号元数据

链上只保存 `invoiceNumberHash`。业务发票号通过本模块与最终 `invoiceId` 绑定，因此创建发票的 Supplier 必须先登录，才能在各参与方和 Auditor 页面显示业务号码。

### `POST /api/invoices/metadata`

需要登录，并要求当前钱包具有 Active Supplier 角色，Buyer 地址具有 Active Buyer 角色。

请求：

```json
{
  "invoiceNumber": "INV-DEMO-001",
  "buyer": "0x...",
  "faceValue": "50000000000000000",
  "issuedAt": "2026-10-09T00:00:00.000Z",
  "dueAt": "2026-10-16T00:00:00.000Z",
  "documentHash": "0x..."
}
```

成功返回 `201` 和创建后的 metadata：

```json
{
  "data": {
    "id": "1",
    "supplier": "0x...",
    "buyer": "0x...",
    "invoiceNumber": "INV-DEMO-001",
    "faceValue": "50000000000000000",
    "issuedAt": "2026-10-09T00:00:00",
    "dueAt": "2026-10-16T00:00:00",
    "documentHash": "0x...",
    "onchainInvoiceId": null,
    "submitTxHash": null,
    "createdAt": "2026-10-09T07:29:47.254077"
  }
}
```

该接口不接收 `fileIds`，也不创建文件草稿。`documentHash` 由前端传入；演示界面留空时，前端根据发票号生成测试哈希。

### `GET /api/invoices/metadata`

需要登录。

- Supplier 和 Buyer 只能读取与自己地址有关的 metadata。
- Active Auditor 可以读取全部 metadata，用于显示业务发票号。
- 查询时，后端会尝试通过 `invoiceIdByKey` 自动恢复尚未绑定但已经上链的记录。

## 6. 实时链上查询

以下接口都需要登录。响应中的 `meta.source` 固定为 `live-rpc`，表示数据实时来自 Sepolia，不来自数据库镜像。

### `GET /api/invoices`

查询参数：

| 参数 | 说明 |
|---|---|
| `status` | 状态编号或状态名称，例如 `confirmed` |
| `role` | `supplier`、`buyer` 或 `participant` |
| `wallet` | 指定钱包；只有 Auditor 或 Admin 可查询其他钱包 |
| `mine` | `true` 时等同于当前登录钱包 |
| `cursor` | 从 0 开始的偏移量 |
| `limit` | 1–100，默认 20 |

普通用户只能查看自己作为 Supplier 或 Buyer 参与的记录。Auditor 和 Admin 可以查看全量链上发票，或使用 `wallet` 筛选。

### `GET /api/invoices/{invoiceId}`

返回发票、状态标签和关联融资摘要。Supplier、Buyer、相关 Funder、Active Funder 的开放机会、Auditor 和 Admin 可按权限读取。

### `GET /api/financing-requests`

查询参数：`status`、`invoiceId`、`role`、`wallet`、`mine`、`cursor`、`limit`。

`role` 可以是 `supplier`、`buyer`、`funder` 或 `participant`。Active Funder 可以读取开放融资机会；历史业务按实际参与地址判断。

### `GET /api/financing-requests/{financingId}`

返回融资、发票、报价和已经存在的 funding 数据。

### `GET /api/financing-requests/{financingId}/offers`

查询参数：`status`、`wallet`、`mine`、`cursor`、`limit`。

Supplier 可查看本融资的全部报价；普通 Funder 只能查看自己的报价；Auditor 和 Admin 可按权限查看。

### 分页响应

```json
{
  "data": [],
  "meta": {
    "chainId": 11155111,
    "source": "live-rpc",
    "total": 0,
    "nextCursor": null
  }
}
```

## 7. 交易验证与历史

### `POST /api/transactions/verify`

需要登录。前端仅在当前钱包已登录时自动调用。

```json
{
  "txHash": "0x...",
  "contractName": "invoiceRegistry",
  "action": "Submit invoice",
  "metadataId": "1"
}
```

`metadataId` 只用于 `Submit invoice`，其他交易可以省略。后端会验证：

- 交易存在且已获得回执；
- 交易发送者等于当前登录钱包；
- 交易目标等于配置的合约地址；
- 回执成功或失败状态；
- 提交发票时，`InvoiceSubmitted` 事件中的 Supplier、Buyer、Face value 和 invoice key 与 metadata 一致。

交易尚未找到时返回 `202`：

```json
{
  "status": "pending",
  "txHash": "0x..."
}
```

提交发票校验成功后，metadata 会写入 `onchainInvoiceId` 和 `submitTxHash`。

### `GET /api/transactions`

需要登录，只返回当前钱包已经由 `/api/transactions/verify` 保存的记录。未登录时发送的链上交易不会进入该后端历史，但链上状态仍然有效。

## 8. 当前数据库表

| 表/模型 | 当前用途 |
|---|---|
| `wallet_nonce` | 一次性登录消息、有效期和使用时间 |
| `auth_session` | 钱包 session token 哈希和有效期 |
| `invoice_metadata` | 业务发票号、核心字段、链上 invoiceId 和提交交易哈希 |
| `transaction_record` | 已登录钱包经过验证的交易摘要 |

SQLite 使用 `db.create_all()` 在启动时创建表，当前没有数据库迁移脚本。

## 9. 当前没有实现的后端接口

以下内容属于总体设计范围，但当前代码没有提供，调用会返回 `404`：

- `/api/auth/logout`；
- `/api/roles/applications`；
- `/api/files` 和文件下载接口；
- `/api/disputes/{id}`；
- `/api/audit/summary`；
- `/api/audit/timeline/{invoiceId}`；
- `/api/sync/verify-transaction`。

当前对应方式为：

- 角色申请和审批直接调用 `RoleRegistry`；
- 争议和 Evidence hash 直接读取 `DisputeResolution`；
- Auditor 汇总和事件时间线由前端实时读取五个合约；
- 正确的交易验证入口是 `/api/transactions/verify`；
- 发票和证据不保存原始文件，只使用前端提供的 `bytes32` 哈希。

## 10. 不建立链上镜像对演示的影响

核心业务不受影响，因为合约是事实来源。可能出现的演示风险只有：

- 首次读取大量发票或事件时 RPC 请求较多；
- Auditor 首次进入时需要查找部署区块并分段扫描日志；
- 公共 RPC 限流或短暂故障会让列表和 Audit 页面加载失败；
- 页面刷新后只能恢复链上状态和 SQLite 已保存的发票号/已验证交易，不能依靠本地镜像离线展示。

演示前使用稳定的 Sepolia RPC、保持测试记录数量较少、提前打开一次 Auditor 页面完成预热即可。当前 6 分钟单发票流程不依赖数据库业务镜像。
