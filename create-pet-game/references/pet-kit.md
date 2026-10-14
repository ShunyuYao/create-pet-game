# 公共 pet-kit：新游戏默认调用的统一抽象

[pet-kit](https://github.com/ShunyuYao/pet-kit) 是作者的公共房间/传输与形象底座。新游戏默认实际调用它，不仅将它列为参考链接。房间座位、大厅、准备、房主设置、可靠事件、状态流/压缩、房主时钟、形象交换、退出和预算统计复用公共层；场景、相机、规则、物理、输入预测、远端插值和业务确认仍由作品实现。

本指南核对 **0.2.1 / `c30592f1656438a72b165e3d00d609519454808a`** 的 [官方说明](https://github.com/ShunyuYao/pet-kit/blob/c30592f1656438a72b165e3d00d609519454808a/README.md)、[公开入口](https://github.com/ShunyuYao/pet-kit/blob/c30592f1656438a72b165e3d00d609519454808a/src/index.js) 与 `src/looks.js`。后续制作先核对公共仓库，再固定此次采用的版本/完整 SHA；不要以浮动 main 或单独版本号代替源码证据。当前 package 是 `private:true`，采用源码导出，不臆造 npm 发布。

## 固定副本与构建

检出上述已核对的公共源码（不需要桌宠宿主源码），在新作品目录执行：

```sh
node <固定的pet-kit检出>/scripts/vendor.cjs <游戏目录>
```

该命令会重建 `vendor/pet-kit`；升级已有作品前保存修改并审查差异。导出包含 `VERSION.json`、源码摘要、MIT 许可、独立校验器及测试 fake。每次作品构建首先调用：

```js
// build.cjs，gameDir 为实际作品目录；不依赖旁边另一份 pet-kit。
const path = require('node:path');
const version = require(path.join(gameDir, 'vendor/pet-kit/verify.cjs')).check(gameDir);
```

游戏只引用 `index.js`（CommonJS 的 `Room` / `Wire`）、`looks.js`（浏览器 ES module）；测试可引用 `testing/fake-sessions.cjs`，构建可用 `verify.cjs`。禁止直接引用内部 `room.js` / `wire.js` / `zip.js`，禁止改 vendor 实现绕过校验。公共层修复回到 pet-kit，重新导出并复验作品。回执保留版本、完整上游 SHA 和副本摘要。

沿用作品自己的模块构建器，将公共入口和游戏模块离线 bundle 为可内联的 `game.js`，再运行本 skill 的 `build-game` / `validate-game`；将 vendor 的 `LICENSE` 加入作品 `THIRD_PARTY_NOTICES.txt`。**`init-game` 仍生成旧 PetGameBridge 技术起点，`build-game` 只做 HTML 装配，不会自动下载、vendor 或 bundle pet-kit。** 替换原有游戏接线，新路径不调用 `PetGameBridge.connect()`，也不另外运行 `sessions.poll/send/transfer` 循环；保留模板装配标记。未使用的旧桥文件可以为空，载入辅助定义也不等于应启动它。成品没有外部模块路径/CDN，玩家只收到一个 HTML。

## 公开入口的实际接线

下面是可被 bundle 的 `room-adapter.mjs`；`game.*` 是作品自己实现的回调，不能把示例当成完整游戏。`protocol` 必须与 `game.json` 的声明相同。回调校验消息 schema、来源席位、round/sequence 和规则；房主只接受客人意图，客人只应用房主确认状态。

```js
import Kit from './vendor/pet-kit/index.js';
import * as Looks from './vendor/pet-kit/looks.js';
const {Room} = Kit;

export function createGameRoom(pet, protocol, game) {
  const assets = new Map();
  const room = Room.create(pet.sessions, {
    protocol, purpose: protocol.id + '.look.v1', maxPlayers: 2,
    appearancePolicy: 'lobby',
    hostState: () => game.fullState(),
    guestState: () => game.input(),
    onState: (state, slot) => room.isHost()
      ? game.acceptInput(state, slot) : game.applySnapshot(state, slot),
    onEvent: (event, slot) => game.acceptEvent(event, slot),
    onReset: info => game.resetStateBaseline(info),
    onAsset(signature, asset, slot) {
      if (!Looks.checkAsset(asset)) throw Error('invalid_character_asset');
      assets.set(signature, asset);
      game.assetAvailable(signature, asset, slot);
    },
    onLobby: lobby => game.updateLobby(lobby, assets),
    onConnection: state => game.connectionChanged(state),
    onClosed: reason => game.closed(reason),
    onError: error => game.showError(error),
    onBudget: info => game.showBudget(info)
  });
  return room;
}
```

获得宿主授权、完成形象读取后调用 `await room.start(driver.profile, driver.asset, prefs)`；本地形象自行登记到作品角色缓存。`Room.create` 传 **`pet.sessions`**，不是整个 `pet`。当前 skill 双人 LAN 必须显式 `maxPlayers:2`（包默认 4）；更多座位不替代宿主能力/构建契约。双人房主席位 0、客人 1，按 `room.mySlot()` 绑定本机输入，不按固定玩家 0 画本人。无 SDK 或 `getContext()` 无邀请时走作品的明确本地预览；`start` 的 `no_invitation` 不代表已联网。

实际操作用 `room.setReady(v)`、`setPrefs(prefs)`；房主通过 `setSettings(settings)` 更新房间规则，在双方在线、准备且角色已可绘制时自己创建 round/seed，再 `setMatch(true)`；回大厅用 `setMatch(false)`。准备和角色解码任一条件变化都重评估，`setMatch` 不会自动创建玩法。离散意图用 `room.emit(event)`，持续输入/快照走上面的状态回调；不再另开游戏 message key。绘制使用独立帧时钟；`room.hostNow()` 对齐房主时间，快照仍携带玩法的模拟时刻/序号。

0.2.1 的 `hostState/guestState/onState` 支持异步生命周期，`onReset` 用于先清理作品旧基线；`onStateSent` 仅表示 SDK 接受发送，**不是对端已应用**。可靠事件的传输确认也不证明规则执行成功：用 actionId/round 校验和房主结果确认；自定义增量仍以对端已应用基线为准。业务异步任务需自己排队/处理失败。主动退出 `try { await room.leave(); } finally { room.dispose(); }`；`dispose()` 只回收本地计时器/轮询。统计用 `room.stats()`，错误、素材失败和预算问题需向玩家反馈。

## 统一形象入口

- 2D 当前桌宠：授权后 `await Looks.currentPetDriver(pet.character)`，读 idle、裁剪并形成 `{profile, asset, portrait}`；它不自动读取完整动画或选择实时 3D。
- 兼容 3D：先 `await pet.character.getRealtime()`，再 `await Looks.realtimeDriver(rt, spriteDriver)`。仅支持对应 rat-doll v2，未知类型返回 null、坏素材可能抛错；说明原因并重试，不静默用玩具冒充当前桌宠。核对 2D/3D 读取的 characterKey 相同，避免换装竞态。生成 `doll3d` 素材后仍需作品兼容渲染器建立骨架、场景和动作。
- 用户主动导入：`Looks.packDriver(zipOrFiles)` / `imageDriver(file)`；缓存用 `configureLooks({dbName:游戏ID})`、`saveDriver/loadDriver`，不把旧缓存称为刚读取的当前外观。玩具形象仅用于明确的预览或用户选择。游戏内素材导入不等于 [产品外观库导入](appearance-import.md)。
- 网络形象用 `room.start/setProfile` 与 `onAsset`。签名随素材改变，先 `Looks.checkAsset` 再解码；按 signature 缓存，在 `onLobby` 选择玩家当前签名，切回缓存不会必然再触发 `onAsset`。双人素材来源 slot 为 0/1；多人宿主向客人转发时可能为 null，仍按签名对应玩家，不能将测试 fake 的多人 context 当作双人来源契约。默认大厅更新；确需局内更新才显式 `continuous`，并实现授权后的形象变更监听及预算验收。`continuous` 本身不会监听桌宠换装。

HTML 的 `window.pet`、能力探测和授权仍遵守 [SDK 契约](desktop-pet-sdk.md)；pet-kit 不绕过权限，也不新增服务器或支持未声明的人数/传输。

## 验收与缺口

验证导出/校验器、离线成品和真实双端输入/事件/形象/退出；拒绝授权、重复动作、断线/epoch、准备恢复与资源重传预算按 [联机修复指南](network-lessons.md) 执行。公共包通过不证明作品无自身回拉、远端停跳或胜负分歧。使用严格 fake 时注明模拟；要复验公共包宿主契约须显式 `PET_HOST_ROOT=<实际宿主检出> npm test`，缺宿主不能记通过。

已有参考游戏可能使用较早版本或独立 net 层：阅读它们的玩法/呈现及修复原因，再映射到当前 pet-kit 公开边界，不照搬旧房间轮询。能力确有缺口时记录调用点、上游缺少什么和受影响验收；优先公共扩展后导出，具体兼容限制另报。不能以“参考旧游戏”为由默认每款都重写公共能力。
