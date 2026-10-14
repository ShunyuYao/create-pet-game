# 桌宠是游戏角色，不只是角落头像

默认把玩家当前桌宠作为游戏里的可辨认角色、棋子或驾驶员。大厅给足够大的形象预览，说明读取来源，提供“重新读取”；动作游戏里保留完整轮廓、原始比例和透明背景，不把大画布缩成难以辨认的 36px 小点，也不拿通用圆球或另画的猫替代成功读取的桌宠。

## 默认参考与两种角色模式

先按 [ShunyuYao 的游戏参考](3d-game-reference.md) 选择相关实现。默认采用作者游戏的 3D 场景/布偶方向，实时角色应在场景里建立骨架对象并应用动作。用户明确选择 2D，或玩法需要固定像素轮廓时，才采用下面的 PNG 姿势流程。不要把本仓库生成的 2D examples 当成默认视觉参考。

## 固定姿势玩法的可复用约定

已核对 [pet-hide-duel](https://github.com/ShunyuYao/pet-hide-duel/tree/276d0204d5211c4318cdc7b2cf563080e565be87) 的 `game/host.js`、`client.js`、`sessions.js`、`doll-assets.mjs` 与 `style.css`：

- `character.getCurrent` 是 2D 代表姿势，不是动画序列；优先 idle，可选读取 walk/greet，缺少可选姿势不伪造。
- `character.getRealtime` 是当前 3D 外观的数据与素材字节；须由作品自己的兼容渲染器解释，不能把 JSON 当图片或把宿主占位帧当成完整换装外观。
- 先在大厅确认角色，再带入对局；邀请确定 host/guest，同一 HTML 内容摘要绑定双方。角色素材经 session transfer 交换，帧更新只传动作和状态。
- 原作是暖纸张、纸板掩体、玩具感交互，大厅以桌宠展示为中心。它的藏匿轮廓/命中公平约束属于其玩法，不要强加给五子棋等其他游戏。

躲猫猫的原创游戏代码保留版权，本包没有复制它的游戏实现。随附 3D 组件来自另一个 MIT 公共项目 [pet-ragdoll-renderer](https://github.com/ShunyuYao/pet-ragdoll-renderer)，许可及修改见 `assets/character/NOTICE.md`。

## PNG 姿势模式：使用配套读取器

构建器会将 `PetCharacter` 与可选的 `PetDollSprite` 放在 bridge 前，成品仍是单个 HTML。`character3d:true` 默认启用兼容实时数据转 PNG 的支持；只有用户明确只需要 2D 时，才在 game.json 配置 `character3d:false` 缩小文件。这个开关不选择 3D 游戏场景，不提供连续骨架动作；实时 3D 场景另按游戏参考实现自己的适配和离线打包。

```js
// 与 link.connect() 分别处理错误；联机连接失败不应阻断本地形象读取。
async function refreshPet() {
  try {
    const raw = await link.readCharacter();
    if (!raw) { showBrowserPreviewHint(); return; }
    const character = await PetCharacter.normalize(raw);
    // character: {key,name,signature,source:'2d'|'realtime',poses,warnings}
    // poses 的画布为 256×256；跨姿势共用裁剪框，保留透明轮廓与相对位置。
    await showFullPet(character);  // 必须实际 Image.decode 后在大厅和场景绘制
    if (link.snapshot().status === 'connected') await link.shareCharacter(character);
  } catch (error) { showCharacterError(PetCharacter.explain(error)); }
}
const link = PetGameBridge.create({
  protocol,
  onCharacter: character => showOtherPlayer(character),
  onStatus: status => { /* 刷新 UI；连接后发送本地缓存形象，失败可重试 */ }
});
void link.connect().catch(showConnectionError);
void refreshPet();
```

不要把 `refreshPet()` 挂在 `connect().then(...)` 后。本人读取和对方素材接收分别维护状态；host/guest 确定前不要把本人图片永久写死在玩家 0。邀请中双方形象尚未解码时禁用准备，显示具体缺少哪一方，而不是一直显示“正在连接”。

`shareCharacter` 传 1–3 张归一化 PNG 与显示名，接收用 `onCharacter`。旧 `sharePortrait` / `onPortrait` 仍兼容单张图，但不再推荐作为动作游戏的唯一素材通道。一次调用成功不能保证对方已解码；用游戏准备状态/业务确认展示接收结果，传输失败允许重试。禁止每帧或每个网络心跳发送图片。

角色变更策略：大厅提供重新读取；若宣称自动跟随换装，必须用经授权的 `character.watch/next` 或有界轮询实现并测试。入局后锁定本局形象，下一局前重新读取，避免旧图片冒充当前角色。

### 3D 范围

内置适配器仅支持 `renderer:'rat-doll-renderer', dataVersion:2`，本地渲染完整头部/衣服外观，导出 idle/walk 的正面透明 PNG，用于 2D 或 2.5D 小游戏。它不是通用 3D 模型导入器，不提供四肢编辑器，也不提供完整帧动画。未知渲染器、无 WebGL 或无效素材必须明确报错；不能静默换成另一只桌宠。需要连续 3D 动作或摆姿势时，应另实现对应的渲染/编辑能力和测试。

### 预览与真实形象

普通浏览器没有 `window.pet`，无法知道用户桌宠。清楚标注“本地预览”，可提供上传透明 PNG/WebP 作为自定义形象，但不要将其称为已读取桌宠。宿主读取失败也可由用户主动选自己的图片；不要自动替换。游戏角色尺寸与命中区可以不同，但视觉和判定差异应清晰可理解。

## 风格选择

用户未指定时，以相关作者游戏的 3D/玩具方向为起点；需要澄清时可提供该项目的场景方向、其他美术方向、用户指定参考。已经授权自行发散就直接设计，不重复询问。视角、玩法、风格是三个不同选择，不因“射击”自动改成黑底荧光军事界面，也不因“桌宠”就擅自绘制一只默认猫。

采用原作方向时：暖米白底、低饱和苔绿与陶土色点缀、纸板/木制道具、柔和细描边、简短中文提示；主视觉留给玩家形象与场景。保持规则和角色辨识度，布局按玩法重做，不复制原作具体页面或暗中替换游戏类型。用户有明确风格偏好时优先遵从。

## 必须看的证据

- 大厅截图能辨认真实桌宠；进入玩法后的截图里仍然是这只桌宠。
- 透明边距较大的 PNG 经过裁剪后也看得清，保持身体比例；至少检查桌面和窄窗口。
- 两端使用不同角色，双方能看到各自正确形象；图片加载失败、拒绝授权、可选姿势缺失时有反馈和重试。
- 3D 测试分别报告模拟数据 WebGL 渲染与真实宿主外观读取；测试了接口存在不等于测试了换装一致。
