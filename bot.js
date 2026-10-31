// bot.js - Bot utama CARTAGENA FAMILY GTA SAMP RP (versi 4: role hierarchy baru)
// Fitur: welcome/goodbye, take-role Tamu, request family via formulir teks,
//        data-karakter (terima sebagai Prince / Queen, tolak, koreksi), struktur family otomatis,
//        gudang per channel (/store-armory, /store-uang, /store-obat, dst).
// Jalankan: node bot.js   (biarkan tetap hidup)

const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Events, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder,
  AttachmentBuilder, PermissionFlagsBits, MessageFlags,
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !GUILD_ID) {
  console.error('Isi dulu TOKEN dan GUILD_ID (export TOKEN="..." ; export GUILD_ID="...").');
  process.exit(1);
}

/* ================= KONFIGURASI ================= */
const CFG = {
  // bot mencari channel yang namanya MENGANDUNG teks ini (boleh lebih dari satu kandidat)
  ch: {
    welcome: 'welcome-goodbye', rules: 'rules-server', takeRole: 'take-role', request: ['request-family', 'request-member'],
    hasil: 'hasil-seleksi', data: 'data-karakter', struktur: 'struktur-family',
    armory: ['data-senjata', 'data-armory'], uang: 'data-uang', obat: ['data-obat', 'data-item'],
    log: 'log-bot',
  },
  gudangCategory: 'GUDANG',   // /stok hanya bisa dipakai di channel dalam kategori ini
  deleteSubmission: true,     // hapus pesan pendaftaran setelah datanya diteruskan ke data-karakter
  styleRoles: false,          // role dibuat oleh setup-server.js; bot tidak perlu merapikan lagi
  syncNickOnStart: true,      // saat bot menyala, samakan nickname semua anggota dengan pangkat tertingginya
};

/* ================= GAYA TAMPILAN ================= */
const SC = { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' };
const sc = (s) => String(s).toLowerCase().replace(/[a-z]/g, (c) => SC[c]); // "Selamat" -> "ꜱᴇʟᴀᴍᴀᴛ"
const LINE = '✦ ━━━━━━━━━━━━━━━━━━ ✦';

// Role: nama HARUS sama dengan yang dibuat setup-server.js
const ROLE_DEF = {
  bigpapa:    { icon: '👑', label: 'Big Papa',             color: 0xf1c40f },
  bigmama:    { icon: '👑', label: 'Big Mama',             color: 0xe91e8c },
  tuanmuda:   { icon: '🎩', label: 'Tuan Muda',            color: 0x9b59b6 },
  nonamuda:   { icon: '🎀', label: 'Nona Muda',            color: 0xff69b4 },
  moderator:  { icon: '🛡️', label: 'Moderator',            color: 0xe67e22 },
  pengurus:   { icon: '📋', label: 'Pengurus Komunitas',   color: 0x1abc9c },
  bendahara:  { icon: '💰', label: 'Bendahara',            color: 0x2ecc71 },
  bigbrother: { icon: '🔱', label: 'Big Brother',          color: 0x3498db, old: ['🧔 Big Brother'] },
  bigsister:  { icon: '💎', label: 'Big Sister',           color: 0xe84393, old: ['👩 Big Sister'] },
  prince:     { icon: '🌟', label: 'Prince',               color: 0x5dade2, old: ['🤵 Prince', '⚔️ Prince', '🪙 Prince', '🦅 Prince'] },
  queen:      { icon: '🌸', label: 'Queen',                color: 0xf48fb1 },
  familycf:   { icon: '🏠', label: 'Family CF',            color: 0x7f8c8d },
  verifiedcf: { icon: '✅', label: 'Verified CF',          color: 0x1f8b4c },
  anggotacf:  { icon: '⚜️', label: 'Anggota Family Cartagena', color: 0xd4af37 }, // role hiasan
  rpmakker:   { icon: '🎮', label: 'RPMAKKER',             color: 0x00bcd4 },        // role hiasan
  tamu:       { icon: '🎭', label: 'Tamu',                 color: 0x95a5a6 },
};
const ROLE_STYLE = Object.fromEntries(Object.entries(ROLE_DEF).map(([k, r]) => [k, { ...r, name: `${r.icon} ${r.label}` }]));
// "👑 Big Papa / 👑 Big Mama" - ikon + nama persis seperti role di server
const roleTitle = (keys) => keys.map((k) => ROLE_STYLE[k].name).join('  /  ');

// Pengelompokan izin bot
const STAFF_KEYS = ['bigpapa', 'bigmama', 'tuanmuda', 'nonamuda', 'moderator', 'pengurus']; // proses pendaftaran, ambil gudang
const FAMILY_KEYS = ['familycf', 'prince', 'queen', 'bigbrother', 'bigsister', 'tuanmuda', 'nonamuda', 'bigpapa', 'bigmama'];

// Struktur family: tiap orang masuk ke rank tertinggi yang dimilikinya
const RANKS = [
  { keys: ['bigpapa', 'bigmama'], desc: 'Kepala keluarga' },
  { keys: ['tuanmuda', 'nonamuda'], desc: 'Pewaris keluarga' },
  { keys: ['bigbrother', 'bigsister'], desc: 'Dewan kakak, pengatur para adik' },
  { keys: ['prince', 'queen'], desc: 'Anggota keluarga' },
];
// Pengurus: TIDAK ditampilkan di struktur, hanya dipakai untuk urutan pangkat nickname
const PENGURUS = [
  { keys: ['moderator'], desc: 'Penjaga aturan' },
  { keys: ['pengurus'], desc: 'Pengelola komunitas' },
  { keys: ['bendahara'], desc: 'Pengelola keuangan dan gudang family' },
];

// Gudang: satu jenis = satu channel = satu set command
const GUDANG = {
  armory: { ch: 'armory', label: 'Armory', icon: '🔫', color: 0x95a5a6, itemLabel: 'Nama senjata / vest / armor' },
  uang: { ch: 'uang', label: 'Uang', icon: '💵', color: 0x2ecc71, money: true },
  obat: { ch: 'obat', label: 'Obat', icon: '💊', color: 0x9b59b6, itemLabel: 'Nama obat' },
};

/* ================= FORMAT PENDAFTARAN ================= */
const FORM_FIELDS = [
  ['nickname', 'nickname discord', 'Nickname Discord'],
  ['nama_ooc', 'nama ooc', 'Nama OOC'],
  ['umur_ooc', 'umur ooc', 'Umur OOC'],
  ['kesibukan', 'kesibukan ooc', 'Kesibukan OOC'],
  ['nama_ic', 'nama ic', 'Nama IC'],
  ['umur_ic', 'umur ic', 'Umur IC'],
  ['tgl_lahir', 'tanggal lahir ic', 'Tanggal Lahir IC'],
  ['alasan', 'alasan ingin masuk', 'Alasan ingin masuk'],
  ['visi', 'visi', 'Visi'],
  ['misi', 'misi', 'Misi'],
  ['waktu', 'waktu bermain', 'Waktu bermain'],
  ['durasi', 'durasi bermain', 'Durasi bermain / masuk kota'],
  ['aktif', 'aktif setiap hari', 'Aktif setiap hari'],
];

// Bagian formulir. color = kode warna ANSI di code block Discord (31 merah, 32 hijau, 33 kuning, 34 biru, 35 pink, 36 cyan)
const SECTIONS = [
  { head: 'DATA DISCORD', icon: '💬', ansi: 34, rows: ['Nickname Discord'] },
  { head: 'DATA OOC', icon: '👤', ansi: 36, rows: ['Nama OOC', 'Umur OOC', 'Kesibukan OOC'] },
  { head: 'DATA IC', icon: '🎭', ansi: 35, rows: ['Nama IC', 'Umur IC', 'Tanggal Lahir IC'] },
  { head: 'MOTIVASI', icon: '🎯', ansi: 33, rows: ['Alasan ingin masuk', 'Visi', 'Misi'] },
  { head: 'KEAKTIFAN', icon: '⏰', ansi: 32, rows: [
    'Waktu bermain (Pagi/Siang/Sore/Malam)', 'Durasi bermain / masuk kota per hari', 'Aktif setiap hari? (Ya/Tidak)',
  ] },
];
const ESC = '\u001b';
const buildBlock = () => SECTIONS.map(({ head, icon, ansi, rows }) => {
  const w = Math.max(...rows.map((l) => l.length));
  return `${ESC}[1;${ansi}m${icon} 【 ${head} 】${ESC}[0m\n` +
    rows.map((l) => `${ESC}[0;${ansi}m▸ ${l.padEnd(w)}${ESC}[0m : `).join('\n');
}).join('\n\n');

// Hanya formulir (tanpa teks tata cara / contoh), satu embed berwarna
const formatPayloads = () => [
  {
    embeds: [new EmbedBuilder().setColor(0xe91e8c)
      .setTitle(`📝 ${sc('formulir request family')}`)
      .setDescription('```ansi\n' + buildBlock() + '\n```')],
  },
];

const normLabel = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

function parseForm(text) {
  const out = {}; let cur = null;
  for (const raw of text.replace(/\u001b?\[[0-9;]*m/g, '').replace(/```(ansi)?/g, '').split(/\r?\n/)) {
    const line = raw.replace(/[*~`]/g, '').trim(); // underscore dipertahankan (Nama_Belakang)
    const m = line.match(/^([^:：]{2,70}?)\s*[:：]\s*(.*)$/);
    if (m) {
      const n = normLabel(m[1]);
      const hit = FORM_FIELDS.find(([, l]) => n.startsWith(l));
      if (hit) { cur = hit[0]; out[cur] = m[2].trim(); continue; }
    }
    if (!line) continue;
    if (!/[:：]/.test(line) && /^[^\p{L}\p{N}]/u.test(line)) continue; // baris judul/dekorasi, bukan isi
    if (cur) out[cur] += (out[cur] ? '\n' : '') + line;
  }
  return out;
}

/* ================= PENYIMPANAN DATA (JSON) ================= */
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
// Auto save: setiap simpan membuat cadangan (.bak) dan ditulis aman (tulis sementara lalu ganti).
// Kalau file utama rusak/hilang, otomatis dibaca dari cadangan.
const load = (n, def) => {
  for (const f of [n, `${n}.bak`]) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { /* coba berikutnya */ }
  }
  return def;
};
const save = (n, o) => {
  const p = path.join(DATA, n);
  try { if (fs.existsSync(p)) fs.copyFileSync(p, `${p}.bak`); } catch { /* abaikan */ }
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(o, null, 2));
  fs.renameSync(`${p}.tmp`, p);
};

const pendaftar = load('pendaftar.json', { counter: 0, list: [] });
const gudang = load('gudang.json', { armory: {}, uang: {}, obat: {} });
const panels = load('panels.json', {});
const roleIds = load('roles.json', {});
for (const k of Object.keys(GUDANG)) gudang[k] = gudang[k] || {};
for (const old of ['obat_haram', 'obat_medis']) { // migrasi data versi lama
  if (gudang[old]) {
    for (const [key, e] of Object.entries(gudang[old])) {
      gudang.obat[key] = gudang.obat[key] || { name: e.name, qty: 0 };
      gudang.obat[key].qty += e.qty;
    }
    delete gudang[old];
  }
}
save('gudang.json', gudang);

const EPH = MessageFlags.Ephemeral;
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

/* ================= HELPER ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
  ],
});

function roleOf(g, key) {
  const st = ROLE_STYLE[key];
  let r = roleIds[key] ? g.roles.cache.get(roleIds[key]) : null;
  if (!r) r = g.roles.cache.find((x) => x.name === st.name || (st.old || []).includes(x.name));
  if (r && roleIds[key] !== r.id) { roleIds[key] = r.id; save('roles.json', roleIds); }
  return r || null; // (id role lama yang sudah dihapus otomatis diabaikan, lalu dicari ulang lewat nama)
}

async function styleRoles(guild) {
  for (const [key, st] of Object.entries(ROLE_STYLE)) {
    const r = roleOf(guild, key);
    if (!r) { console.log(`[!] Role "${st.name}" belum ada.`); continue; }
    if (r.name === st.name && r.color === st.color) continue;
    await r.edit({ name: st.name, color: st.color, reason: 'Rapikan tampilan role' })
      .catch((e) => console.log(`[!] Gagal merapikan role ${st.name}: ${e.message} (pindahkan role bot ke atas)`));
  }
}

/* ===== Nickname otomatis: "<ikon> <pangkat tertinggi> | <nama IC>" ===== */
// urutan pangkat dari tertinggi ke terendah (Big Papa ... Queen, lalu pengurus)
const RANK_ORDER = [...RANKS, ...PENGURUS].flatMap((r) => r.keys);
const topRankKey = (member, extraKey) => RANK_ORDER.find((k) => k === extraKey || hasRole(member, k)) || null;

function makeNick(name, key) {
  const st = key && ROLE_STYLE[key];
  const prefix = st ? `${st.icon} ${st.label} | ` : 'CF | ';
  const room = Math.max(1, 32 - prefix.length);
  return prefix + String(name).trim().slice(0, room);
}
// nama IC: dari data pendaftaran kalau ada, kalau tidak dari nickname sekarang (bagian setelah " | ")
function icNameOf(member) {
  const rec = [...pendaftar.list].reverse().find((r) => r.userId === member.id && r.status === 'diterima');
  if (rec) return rec.f.nama_ic;
  const cur = member.nickname || member.user.globalName || member.user.username;
  return cur.includes(' | ') ? cur.split(' | ').slice(1).join(' | ') : cur;
}
async function applyNick(member, name, extraKey) {
  const nick = makeNick(name, topRankKey(member, extraKey));
  if (member.nickname === nick) return { ok: true, nick };
  if (member.id === member.guild.ownerId) {
    return { ok: false, reason: 'Pemilik server tidak bisa diubah nickname-nya oleh bot. Ubah manual.' };
  }
  try {
    await member.setNickname(nick, 'Auto nickname anggota');
    return { ok: true, nick };
  } catch (e) {
    console.error('setNickname gagal:', e.code, e.message);
    return {
      ok: false,
      reason: e.code === 50013
        ? 'Bot tidak punya izin mengubah nickname. Pindahkan role bot ke ATAS role member (Server Settings ➜ Roles) dan pastikan izin Manage Nicknames aktif.'
        : e.message,
    };
  }
}
async function syncNicks(guild) {
  for (const m of guild.members.cache.values()) {
    if (m.user.bot || !isMember(m)) continue;
    const r = await applyNick(m, icNameOf(m));
    if (!r.ok) console.log(`[!] Nickname ${m.user.username}: ${r.reason}`);
    await new Promise((res) => setTimeout(res, 1200)); // jeda supaya tidak kena rate limit
  }
}
const chanOf = (g, key) => {
  const names = [].concat(CFG.ch[key]);
  return g.channels.cache.find((c) => c.type === ChannelType.GuildText && names.some((n) => c.name.includes(n)));
};
const hasRole = (m, key) => { const r = roleOf(m.guild, key); return !!r && m.roles.cache.has(r.id); };
const hasAny = (m, keys) => keys.some((k) => hasRole(m, k));
const isStaff = (m) => m.permissions.has(PermissionFlagsBits.Administrator) || hasAny(m, STAFF_KEYS);
const isGudang = (m) => isStaff(m) || hasRole(m, 'bendahara');
const isMember = (m) => isGudang(m) || hasAny(m, FAMILY_KEYS);
const trunc = (s, n = 1000) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 3) + '...' : s; };
const mention = (g, key) => { const c = chanOf(g, key); return c ? `<#${c.id}>` : `#${[].concat(CFG.ch[key])[0]}`; };
const num = (n) => Number(n).toLocaleString('id-ID');

// edit pesan panel kalau ada, kalau tidak kirim baru
async function upsert(key, ch, payload) {
  if (!ch) { console.log(`[!] Channel untuk "${key}" tidak ditemukan.`); return; }
  let msg = null;
  if (panels[key]) msg = await ch.messages.fetch(panels[key]).catch(() => null);
  if (msg) await msg.edit(payload);
  else { msg = await ch.send(payload); panels[key] = msg.id; save('panels.json', panels); }
}

// hapus pesan panel lama lalu kirim baru (supaya selalu di paling bawah)
async function bump(key, ch, payload) {
  if (!ch) return;
  if (panels[key]) {
    const old = await ch.messages.fetch(panels[key]).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }
  const msg = await ch.send(payload);
  panels[key] = msg.id; save('panels.json', panels);
}

async function dropPanel(key, ch) {
  if (!panels[key]) return;
  if (ch) { const m = await ch.messages.fetch(panels[key]).catch(() => null); if (m) await m.delete().catch(() => {}); }
  delete panels[key]; save('panels.json', panels);
}

/* ================= TAKE ROLE ================= */
const takePanel = () => ({
  embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(`🎭 ${sc('ambil role tamu')}`)
    .setDescription([
      LINE,
      'Tekan tombol di bawah untuk mendapatkan role **Tamu**.',
      'Setelah itu channel **Public** akan terbuka untukmu.',
      LINE,
    ].join('\n'))],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('role:tamu').setLabel('Ambil Role Tamu').setEmoji('🎭').setStyle(ButtonStyle.Success),
  )],
});

/* ================= REQUEST FAMILY (command /format) ================= */
// Pendaftar memakai /format: semua kolom diisi lewat command (plus 2 gambar), lalu bot
// menyusun ulang formulir yang rapi dan mengirimnya ke data-karakter. Tidak ada salin-tempel.
// Pesan panel TIDAK pernah dikirim ulang: kalau sudah ada, hanya diedit di tempat.
const reqPanel = () => ({
  embeds: [new EmbedBuilder().setColor(0xe91e8c)
    .setTitle(`📝 ${sc('request family')}`)
    .setDescription([
      LINE,
      'Ketik **/format** di channel ini, lalu isi semua kolom yang muncul.',
      'Lampirkan 2 gambar: **ktp** (foto KTP) dan **stats** (foto Stats).',
      'Bot akan menyusun formulirmu dengan rapi dan mengirimnya ke staff. Tidak perlu salin format.',
      LINE,
    ].join('\n'))],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('req:daftar').setLabel('Cara Daftar').setEmoji('📝').setStyle(ButtonStyle.Success),
  )],
});

// Tombol panel: hanya menjelaskan cara daftar
async function openApplication(i) {
  if (isMember(i.member)) return i.reply({ content: 'Kamu sudah menjadi anggota family.', flags: EPH });
  if (pendaftar.list.some((r) => r.userId === i.user.id && r.status === 'pending')) {
    return i.reply({ content: '⏳ Pendaftaranmu sudah terkirim dan menunggu keputusan staff.', flags: EPH });
  }
  return i.reply({
    content: 'Ketik **/format** di channel ini, isi semua kolom, lalu lampirkan foto **ktp** dan **stats**. Selesai, bot yang merapikan formulirnya.',
    flags: EPH,
  });
}

// Teks formulir yang sudah terisi, dengan gaya warna yang sama seperti format lama
const cleanVal = (s) => String(s ?? '').replace(/\u001b/g, '').replace(/`/g, "'").replace(/[\r\n]+/g, ' ').trim();
const filledBlock = (f) => {
  let n = 0;
  return SECTIONS.map(({ head, icon, ansi, rows }) => {
    const w = Math.max(...rows.map((l) => l.length));
    return `${ESC}[1;${ansi}m${icon} 【 ${head} 】${ESC}[0m\n` +
      rows.map((l) => `${ESC}[0;${ansi}m▸ ${l.padEnd(w)}${ESC}[0m : ${f[FORM_FIELDS[n++][0]] || ''}`).join('\n');
  }).join('\n\n');
};

// Definisi command /format: 13 kolom teks (wajib) + 2 gambar (opsional hanya untuk koreksi)
const FORMAT_OPTS = {
  nickname: ['Nickname Discord', 60], nama_ooc: ['Nama OOC', 60], umur_ooc: ['Umur OOC (angka)', 3],
  kesibukan: ['Kesibukan OOC', 100], nama_ic: ['Nama IC', 40], umur_ic: ['Umur IC (angka)', 3],
  tgl_lahir: ['Tanggal Lahir IC', 30], alasan: ['Alasan ingin masuk', 400], visi: ['Visi', 250], misi: ['Misi', 250],
  waktu: ['Waktu bermain (Pagi/Siang/Sore/Malam)', 80], durasi: ['Durasi bermain / masuk kota per hari', 100],
  aktif: ['Aktif setiap hari? (Ya/Tidak)', 30],
};
function formatCommand() {
  const b = new SlashCommandBuilder().setName('format').setDescription('Isi pendaftaran request family');
  for (const [k] of FORM_FIELDS) {
    const [desc, max] = FORMAT_OPTS[k];
    b.addStringOption((o) => {
      o.setName(k).setDescription(desc).setRequired(true);
      if (k === 'aktif') o.addChoices({ name: 'Ya', value: 'Ya' }, { name: 'Tidak', value: 'Tidak' });
      else o.setMaxLength(max);
      return o;
    });
  }
  b.addAttachmentOption((o) => o.setName('ktp').setDescription('Foto KTP (gambar)'));
  b.addAttachmentOption((o) => o.setName('stats').setDescription('Foto Stats (gambar)'));
  return b;
}

const busy = new Set();

async function handleFormat(i) {
  const req = chanOf(i.guild, 'request');
  if (!req || i.channelId !== req.id) {
    return i.reply({ content: `Command ini hanya bisa dipakai di ${mention(i.guild, 'request')}.`, flags: EPH });
  }
  if (isMember(i.member)) return i.reply({ content: 'Kamu sudah menjadi anggota family.', flags: EPH });
  if (pendaftar.list.some((r) => r.userId === i.user.id && r.status === 'pending')) {
    return i.reply({ content: '⏳ Pendaftaranmu masih menunggu keputusan staff.', flags: EPH });
  }
  if (busy.has(i.user.id)) return i.reply({ content: 'Pendaftaranmu sedang diproses, tunggu sebentar.', flags: EPH });

  const f = {};
  for (const [k] of FORM_FIELDS) f[k] = cleanVal(i.options.getString(k));
  const problems = [];
  const missing = FORM_FIELDS.filter(([k]) => !f[k]).map(([, , name]) => name);
  if (missing.length) problems.push(`Kolom belum diisi: **${missing.join(', ')}**`);
  for (const [k, label] of [['umur_ooc', 'Umur OOC'], ['umur_ic', 'Umur IC']]) {
    if (f[k] && !/^\d{1,3}$/.test(f[k])) problems.push(`**${label}** harus berupa angka.`);
  }

  // Foto: kirim keduanya. Untuk pendaftar yang diminta koreksi, boleh dikosongkan (foto lama dipakai ulang)
  const prev = [...pendaftar.list].reverse().find((r) => r.userId === i.user.id && r.status === 'koreksi');
  const prevFiles = prev && prev.ktp && prev.stats
    && [prev.ktp, prev.stats].every((n) => fs.existsSync(path.join(UPLOADS, n))) ? prev : null;
  const imgs = [i.options.getAttachment('ktp'), i.options.getAttachment('stats')];
  const given = imgs.filter(Boolean).length;
  const reuse = given === 0 && !!prevFiles;
  if (given === 1) problems.push('Lampirkan **ktp** dan **stats** sekaligus.');
  else if (given === 0 && !prevFiles) problems.push('Lampirkan foto **ktp** dan **stats**.');
  if (given === 2) {
    if (imgs.some((a) => !EXT[(a.contentType || '').split(';')[0]])) problems.push('Foto harus berformat PNG, JPG, atau WEBP.');
    if (imgs.some((a) => a.size > 8 * 1024 * 1024)) problems.push('Ukuran gambar maksimal 8 MB per file.');
  }
  if (problems.length) return i.reply({ content: `❌ Pendaftaran belum lengkap:\n${problems.join('\n')}\nKetik **/format** lagi.`, flags: EPH });

  const dataCh = chanOf(i.guild, 'data');
  if (!dataCh) return i.reply({ content: '⚠️ Channel data-karakter tidak ditemukan. Hubungi admin.', flags: EPH });
  await i.deferReply({ flags: EPH });
  busy.add(i.user.id);
  try {
    const id = pendaftar.counter + 1;
    const files = []; const names = {};
    for (const [n, label] of [[0, 'ktp'], [1, 'stats']]) {
      let buf; let ext;
      if (reuse) {
        buf = fs.readFileSync(path.join(UPLOADS, prevFiles[label]));
        ext = path.extname(prevFiles[label]);
      } else {
        const a = imgs[n];
        buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
        ext = EXT[a.contentType.split(';')[0]];
      }
      const fname = `${id}-${label}${ext}`;
      fs.writeFileSync(path.join(UPLOADS, fname), buf);
      files.push(new AttachmentBuilder(buf, { name: fname }));
      names[label] = fname;
    }
    const rec = {
      id, userId: i.user.id, tag: i.user.username, f, raw: '',
      ktp: names.ktp, stats: names.stats, status: 'pending', note: '', createdAt: new Date().toISOString(),
    };
    const sent = await dataCh.send({ embeds: [recEmbed(rec)], components: [decisionRow(id)], files });
    rec.messageId = sent.id;
    pendaftar.counter = id;
    pendaftar.list.push(rec);
    save('pendaftar.json', pendaftar);
    await i.editReply(`✅ Pendaftaranmu **terkirim**! Pantau hasilnya di ${mention(i.guild, 'hasil')} 🕊️`);
  } catch (e) {
    console.error('Gagal memproses /format:', e);
    await i.editReply('⚠️ Terjadi error saat mengirim pendaftaran. Coba lagi atau hubungi staff.').catch(() => {});
  } finally {
    busy.delete(i.user.id);
  }
}

/* ================= DATA KARAKTER ================= */
const STATUS = {
  pending: ['🟡 MENUNGGU KEPUTUSAN', 0xf1c40f],
  diterima: ['🟢 DITERIMA JADI ANGGOTA', 0x2ecc71],
  ditolak: ['🔴 DITOLAK', 0xe74c3c],
  koreksi: ['🟠 PERLU KOREKSI', 0xe67e22],
};

function recEmbed(rec) {
  const [label, color] = STATUS[rec.status];
  let st = label;
  if (rec.note) st += `\n**Catatan:** ${trunc(rec.note, 400)}`;
  if (rec.handledBy) st += `\n**Diproses oleh:** <@${rec.handledBy}>`;
  return new EmbedBuilder().setColor(color).setTitle(`📋 ${sc('data karakter')} #${rec.id}`)
    .setDescription(`${LINE}\n🙋 Pendaftar: <@${rec.userId}> (${rec.tag})\n${LINE}\n` + '```ansi\n' + filledBlock(rec.f) + '\n```')
    .addFields(
      { name: `📌 ${sc('status')}`, value: st },
      { name: `🖼️ ${sc('berkas')}`, value: '📎 Lampiran 1: **KTP**  ┃  📎 Lampiran 2: **Stats** (terlampir di pesan ini)' },
    )
    .setTimestamp(new Date(rec.createdAt));
}

const decisionRow = (id) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`acc:${id}:prince`).setLabel('Terima (Prince)').setEmoji('🌟').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`acc:${id}:queen`).setLabel('Terima (Queen)').setEmoji('🌸').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`rej:${id}`).setLabel('Tolak').setEmoji('❌').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(`cor:${id}`).setLabel('Koreksi').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
);

const modalReason = (prefix, id, title) => new ModalBuilder().setCustomId(`${prefix}:${id}`).setTitle(title)
  .addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('alasan').setLabel('Alasan / catatan').setStyle(TextInputStyle.Paragraph)
      .setRequired(true).setMaxLength(500),
  ));

async function decide(i, id, status, note, rank) {
  const rec = pendaftar.list.find((r) => r.id === id);
  if (!rec || rec.status !== 'pending') {
    return i.followUp({ content: 'Data ini sudah diproses sebelumnya.', flags: EPH });
  }
  const guild = i.guild;
  rec.status = status;
  rec.note = note || '';
  if (status === 'diterima') rec.rank = rank === 'queen' ? 'queen' : 'prince';
  rec.handledBy = i.user.id;
  rec.handledAt = new Date().toISOString();
  save('pendaftar.json', pendaftar);

  const member = await guild.members.fetch(rec.userId).catch(() => null);
  let extra = '';
  if (status === 'diterima') {
    if (member) {
      // Prince/Queen + role hiasan (Family CF, Verified CF, Anggota Family Cartagena, RPMAKKER), lalu role Tamu dicabut
      const give = [rec.rank, 'familycf', 'verifiedcf', 'anggotacf', 'rpmakker'].map((k) => roleOf(guild, k)).filter(Boolean);
      const t = roleOf(guild, 'tamu');
      if (give.length) await member.roles.add(give).catch(console.error);
      if (t) await member.roles.remove(t).catch(() => {});
      const nk = await applyNick(member, rec.f.nama_ic, rec.rank);
      if (nk.ok) extra = `\n🏷️ Nickname: **${nk.nick}**`;
      else await i.followUp({ content: `⚠️ Role sudah diberikan, tapi nickname gagal diubah.\n${nk.reason}`, flags: EPH }).catch(() => {});
    } else extra = '\n(Pendaftar sudah tidak ada di server.)';
  }

  await i.message.edit({ embeds: [recEmbed(rec)], components: [] }).catch(console.error);

  const nama = rec.f.nama_ic;
  const text = {
    diterima: `🎉 **${nama}** diterima sebagai **${rec.rank === 'queen' ? 'Queen' : 'Prince'}** Cartagena Family. Selamat bergabung di keluarga!${extra}`,
    ditolak: `❌ Pendaftaran **${nama}** ditolak.\n📝 **Alasan:** ${rec.note}`,
    koreksi: `✏️ Pendaftaran **${nama}** perlu dikoreksi.\n📝 **Catatan:** ${rec.note}\n🔁 Ketik **/format** lagi di ${mention(guild, 'request')} dan isi ulang datanya. Foto boleh dikosongkan kalau tidak ada yang diganti.`,
  }[status];
  const judul = { diterima: '🎉 diterima', ditolak: '❌ ditolak', koreksi: '✏️ perlu koreksi' }[status];
  const hasil = chanOf(guild, 'hasil');
  if (hasil) {
    await hasil.send({
      content: `<@${rec.userId}>`,
      embeds: [new EmbedBuilder().setColor(STATUS[status][1]).setTitle(`${judul.split(' ')[0]} ${sc('hasil seleksi')} #${rec.id}`)
        .setDescription(`${LINE}\n${text}\n${LINE}`).setTimestamp()],
    }).catch(console.error);
  }
  if (member) member.send(`Hasil pendaftaran di **${guild.name}**:\n${text}`).catch(() => {});
  scheduleStruktur(guild);
}

/* ================= AUTO SAVE: PEMULIHAN DATA PENDAFTAR ================= */
// Kalau data/pendaftar.json hilang atau tidak ikut terbawa saat update, data pendaftar dibaca ulang
// dari embed di data-karakter, sehingga tombol Terima/Tolak/Koreksi tetap berfungsi
// dan pendaftar TIDAK perlu mendaftar ulang.
function rebuildRecord(id, m, e) {
  const desc = e.description || '';
  const userId = (desc.match(/<@!?(\d+)>/) || [])[1];
  const nf = (e.fields || []).length;
  if (!userId || nf < 2) return null;
  const v = (n) => e.fields[n]?.value || '';
  const pick = (text, label) => ((text.match(new RegExp(`${label}:\\s*(.*)`)) || [])[1] || '').replace(/\*\*/g, '').trim();
  let f; let stField;
  if (nf >= 7) { // format lama (kolom terpisah)
    stField = v(6);
    f = {
      nickname: (desc.match(/Discord:\s*\*\*(.*?)\*\*/) || [])[1] || '',
      nama_ooc: pick(v(0), 'Nama'), umur_ooc: pick(v(0), 'Umur'), kesibukan: pick(v(0), 'Kesibukan'),
      nama_ic: pick(v(1), 'Nama'), umur_ic: pick(v(1), 'Umur'), tgl_lahir: pick(v(1), 'Tanggal lahir'),
      alasan: v(2), visi: v(3), misi: v(4),
      waktu: pick(v(5), 'Waktu'), durasi: pick(v(5), 'Durasi'), aktif: pick(v(5), 'Aktif tiap hari'),
    };
  } else { // format baru: formulir ansi di deskripsi
    stField = v(0);
    const parsed = parseForm(desc.split('```ansi')[1] || '');
    f = {};
    for (const [k] of FORM_FIELDS) f[k] = (parsed[k] || '').trim();
  }
  const label = stField.split('\n')[0].trim();
  const status = Object.keys(STATUS).find((k) => STATUS[k][0] === label) || 'pending';
  const rec = {
    id, userId,
    tag: (desc.match(/\(([^)]*)\)/) || [])[1] || '',
    f,
    raw: '', ktp: null, stats: null, status,
    note: (stField.match(/\*\*Catatan:\*\*\s*(.*)/) || [])[1] || '',
    createdAt: e.timestamp ? new Date(e.timestamp).toISOString() : m.createdAt.toISOString(),
    messageId: m.id, recovered: true,
  };
  const by = (stField.match(/Diproses oleh:\*\*\s*<@!?(\d+)>/) || [])[1];
  if (by) rec.handledBy = by;
  return rec;
}

async function recoverPendaftar(guild) {
  const ch = chanOf(guild, 'data');
  if (!ch) return;
  const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return;
  let n = 0;
  for (const m of msgs.values()) {
    if (m.author.id !== client.user.id) continue;
    const e = m.embeds[0];
    const idm = e?.title?.match(/#(\d+)\s*$/);
    if (!idm) continue;
    const id = Number(idm[1]);
    if (pendaftar.list.some((r) => r.id === id)) continue;
    const rec = rebuildRecord(id, m, e);
    if (!rec) continue;
    pendaftar.list.push(rec);
    pendaftar.counter = Math.max(pendaftar.counter, id);
    n++;
  }
  if (n) {
    pendaftar.list.sort((a, b) => a.id - b.id);
    save('pendaftar.json', pendaftar);
    console.log(`Auto save: ${n} data pendaftar dipulihkan dari #${ch.name}.`);
  }
}

/* ================= STRUKTUR FAMILY (otomatis) ================= */
function treeList(items) { // items: [{ id, icon }]
  if (!items.length) return '┗ *kosong*';
  const lines = []; let len = 0;
  for (let n = 0; n < items.length; n++) {
    const line = `${n === items.length - 1 ? '┗' : '┣'} ${items[n].icon} <@${items[n].id}>`;
    if (len + line.length + 1 > 850) { lines.push(`┗ … +${items.length - n} lainnya`); break; }
    lines.push(line); len += line.length + 1;
  }
  return lines.join('\n');
}

async function updateStruktur(guild) {
  const ch = chanOf(guild, 'struktur');
  if (!ch) return;
  await guild.members.fetch().catch(console.error);
  const groups = RANKS.map(() => []);
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    const top = RANKS.findIndex((r) => hasAny(m, r.keys)); // rank tertinggi saja
    if (top >= 0) {
      const key = RANKS[top].keys.find((k) => hasRole(m, k)); // role-nya sendiri -> ikon di samping nama
      groups[top].push({ id: m.id, icon: ROLE_STYLE[key].icon });
    }
  }
  const total = groups.reduce((n, g) => n + g.length, 0);
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`🏠 ${sc('struktur')} ${sc(guild.name)}`)
    .setDescription(`${LINE}\nSusunan family diperbarui **otomatis** saat role berubah.\n${LINE}`);
  RANKS.forEach((r, n) => {
    embed.addFields({ name: `${roleTitle(r.keys)}  ┃  ${groups[n].length}`, value: `*${r.desc}*\n${treeList(groups[n])}` });
  });
  embed.setFooter({ text: `Total ${total} orang • Terakhir diperbarui` }).setTimestamp();
  await upsert('struktur', ch, { embeds: [embed] });
}

let strukturTimer;
function scheduleStruktur(guild) {
  clearTimeout(strukturTimer);
  strukturTimer = setTimeout(() => updateStruktur(guild).catch(console.error), 3000);
}

/* ================= GUDANG (per channel) ================= */
function listText(k) {
  const rows = Object.values(gudang[k]).filter((x) => x.qty > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return '— kosong —';
  return trunc(rows.map((x, n) => `${n === rows.length - 1 ? '┗' : '┣'} ${x.name} ➜ **${GUDANG[k].money ? '$' : ''}${num(x.qty)}**`).join('\n'), 3800);
}

const gudangPanel = (k) => {
  const g = GUDANG[k];
  return {
    embeds: [new EmbedBuilder().setColor(g.color).setTitle(`${g.icon} ${sc('stok ' + g.label)}`)
      .setDescription(`${LINE}\n${listText(k)}\n${LINE}`)
      .setFooter({ text: `📥 /store-${k}  •  📤 /ambil-${k}` }).setTimestamp()],
  };
};

async function renderGudang(guild, keys = Object.keys(GUDANG), bumpIt = false) {
  for (const k of keys) {
    const ch = chanOf(guild, GUDANG[k].ch);
    if (bumpIt) await bump(`gudang_${k}`, ch, gudangPanel(k));
    else await upsert(`gudang_${k}`, ch, gudangPanel(k));
  }
}

function gudangCommands() {
  const out = [];
  for (const [k, g] of Object.entries(GUDANG)) {
    for (const [verb, desc] of [['store', 'Simpan ke'], ['ambil', 'Ambil dari']]) {
      const b = new SlashCommandBuilder().setName(`${verb}-${k}`).setDescription(`${desc} gudang ${g.label}`);
      if (!g.money) b.addStringOption((o) => o.setName('nama').setDescription(g.itemLabel).setRequired(true).setMaxLength(60));
      b.addIntegerOption((o) => o.setName('jumlah').setDescription(g.money ? 'Jumlah uang' : 'Jumlah').setMinValue(1).setRequired(true));
      b.addStringOption((o) => o.setName('catatan').setDescription('Catatan (opsional)').setMaxLength(200));
      out.push(b);
    }
  }
  out.push(new SlashCommandBuilder().setName('stok').setDescription('Lihat stok seluruh gudang family'));
  out.push(formatCommand());
  return out.map((c) => c.toJSON());
}

async function handleGudang(i) {
  const [verb, k] = i.commandName.split('-');
  const g = GUDANG[k];
  const target = chanOf(i.guild, g.ch);
  if (!target || i.channelId !== target.id) {
    return i.reply({ content: `Command ini hanya bisa dipakai di ${target ? `<#${target.id}>` : 'channel gudang yang sesuai'}.`, flags: EPH });
  }
  const m = i.member;
  if (!isMember(m)) return i.reply({ content: 'Hanya anggota family yang bisa memakai command ini.', flags: EPH });
  if (verb === 'ambil' && !isGudang(m)) {
    return i.reply({ content: 'Hanya Bendahara, Moderator, Pengurus, dan keluarga inti (Big Papa/Mama, Tuan/Nona Muda) yang boleh mengambil dari gudang.', flags: EPH });
  }

  const jumlah = i.options.getInteger('jumlah');
  const catatan = i.options.getString('catatan') || '';
  const nama = g.money ? 'Uang' : i.options.getString('nama').trim();
  const key = nama.toLowerCase();
  const entry = gudang[k][key] || { name: nama, qty: 0 };
  if (verb === 'ambil' && entry.qty < jumlah) {
    return i.reply({ content: `Stok **${entry.name}** tidak cukup (tersedia ${g.money ? '$' : ''}${num(entry.qty)}).`, flags: EPH });
  }
  entry.qty += verb === 'store' ? jumlah : -jumlah;
  gudang[k][key] = entry;
  save('gudang.json', gudang);

  const cur = g.money ? '$' : '';
  const emb = new EmbedBuilder().setColor(verb === 'store' ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`${verb === 'store' ? '📥' : '📤'} ${sc(verb === 'store' ? 'simpan ke gudang' : 'ambil dari gudang')} ${g.icon}`)
    .addFields(
      { name: '👤 Oleh', value: `<@${i.user.id}>`, inline: true },
      { name: '📦 Item', value: g.money ? `${cur}${num(jumlah)}` : `${entry.name} x${num(jumlah)}`, inline: true },
      { name: '📊 Stok sekarang', value: `${cur}${num(entry.qty)}`, inline: true },
    ).setTimestamp();
  if (catatan) emb.addFields({ name: '📝 Catatan', value: trunc(catatan, 300) });

  await i.reply({ embeds: [emb] });
  const log = chanOf(i.guild, 'log');
  if (log) log.send({ embeds: [emb] }).catch(() => {});
  await renderGudang(i.guild, [k], true); // panel stok dipindah ke paling bawah
}

async function handleStok(i) {
  const parent = i.channel?.parent?.name?.toUpperCase() || '';
  if (!parent.includes(CFG.gudangCategory)) {
    return i.reply({ content: 'Command ini hanya bisa dipakai di channel kategori gudang.', flags: EPH });
  }
  if (!isMember(i.member)) return i.reply({ content: 'Khusus anggota family.', flags: EPH });
  const emb = new EmbedBuilder().setColor(0x3498db).setTitle(`📦 ${sc('stok gudang')}`)
    .addFields(...Object.entries(GUDANG).map(([k, g]) => ({ name: `${g.icon} ${g.label}`, value: trunc(listText(k), 1000) })));
  return i.reply({ embeds: [emb], flags: EPH });
}

/* ================= TOMBOL & MODAL ================= */
async function handleButton(i) {
  const [a, b] = i.customId.split(':');

  if (a === 'req') return openApplication(i);

  if (a === 'role') {
    const t = roleOf(i.guild, 'tamu');
    if (!t) return i.reply({ content: 'Role Tamu belum ada. Hubungi admin.', flags: EPH });
    if (isMember(i.member)) return i.reply({ content: 'Kamu sudah punya akses lebih tinggi dari Tamu.', flags: EPH });
    if (i.member.roles.cache.has(t.id)) return i.reply({ content: 'Kamu sudah punya role Tamu.', flags: EPH });
    await i.member.roles.add(t);
    return i.reply({ content: '✅ Role **Tamu** diberikan. Channel Public sekarang terbuka!', flags: EPH });
  }

  if (['acc', 'rej', 'cor'].includes(a)) {
    if (!isStaff(i.member)) return i.reply({ content: 'Hanya Moderator, Pengurus, dan keluarga inti yang bisa memproses pendaftaran.', flags: EPH });
    const id = Number(b);
    if (a === 'acc') {
      const rank = i.customId.split(':')[2];
      if (rank !== 'prince' && rank !== 'queen') { // tombol versi lama: perbarui ke tombol Prince/Queen
        await i.message.edit({ components: [decisionRow(id)] }).catch(() => {});
        return i.reply({ content: 'Tombol diperbarui. Silakan pilih **Terima (Prince)** atau **Terima (Queen)**.', flags: EPH });
      }
      await i.deferUpdate();
      return decide(i, id, 'diterima', '', rank);
    }
    if (a === 'rej') return i.showModal(modalReason('rejm', id, 'Alasan penolakan'));
    return i.showModal(modalReason('corm', id, 'Catatan koreksi'));
  }
}

async function handleModal(i) {
  const [a, b] = i.customId.split(':');
  if (a === 'rejm' || a === 'corm') {
    if (!isStaff(i.member)) return i.reply({ content: 'Tidak punya izin.', flags: EPH });
    await i.deferUpdate();
    return decide(i, Number(b), a === 'rejm' ? 'ditolak' : 'koreksi', i.fields.getTextInputValue('alasan').trim());
  }
}

/* ================= EVENT ================= */
client.once(Events.ClientReady, async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch(); await guild.channels.fetch();
  await guild.commands.set(gudangCommands());
  if (CFG.styleRoles) await styleRoles(guild);

  // bersihkan panel versi lama (tombol request & panel obat lama)
  await dropPanel('req', chanOf(guild, 'request'));
  await dropPanel('gudang_item', chanOf(guild, 'obat'));
  await dropPanel('gudang_obat_haram', chanOf(guild, 'obat'));

  await upsert('take', chanOf(guild, 'takeRole'), takePanel());

  const req = chanOf(guild, 'request');
  if (req) {
    // pesan format lama diubah jadi panel (diedit di tempat, TIDAK dikirim ulang)
    const oldFmt = [].concat(panels.req_format || []);
    if (!panels.req_panel && oldFmt.length) { panels.req_panel = oldFmt[0]; }
    if (panels.req_format) { delete panels.req_format; save('panels.json', panels); }
    await upsert('req_panel', req, reqPanel());
    await recoverPendaftar(guild);
  }

  await updateStruktur(guild);
  await renderGudang(guild);
  if (CFG.syncNickOnStart) syncNicks(guild).catch(console.error);
  console.log(`Bot aktif sebagai ${client.user.tag}`);
});

client.on(Events.GuildMemberAdd, async (m) => {
  if (m.guild.id !== GUILD_ID) return;
  const ch = chanOf(m.guild, 'welcome');
  if (ch) {
    ch.send({
      content: `${m}`,
      embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(`👋 ${sc('selamat datang')} ✨`)
        .setDescription([
          `Halo ${m}, selamat datang di **${m.guild.name}**!`,
          LINE,
          `📜 Baca aturan ➜ ${mention(m.guild, 'rules')}`,
          `🎭 Ambil role Tamu ➜ ${mention(m.guild, 'takeRole')}`,
          `📝 Request family ➜ ${mention(m.guild, 'request')}`,
          LINE,
        ].join('\n'))
        .setThumbnail(m.displayAvatarURL()).setFooter({ text: `Member ke-${m.guild.memberCount}` }).setTimestamp()],
    }).catch(console.error);
  }
  scheduleStruktur(m.guild);
});

client.on(Events.GuildMemberRemove, async (m) => {
  if (m.guild.id !== GUILD_ID) return;
  const ch = chanOf(m.guild, 'welcome');
  if (ch) {
    ch.send({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle(`🕊️ ${sc('sampai jumpa')}`)
        .setDescription(`${LINE}\n**${m.user.username}** telah meninggalkan server.\nSemoga kita bertemu lagi 🌙\n${LINE}`)
        .setThumbnail(m.user.displayAvatarURL()).setTimestamp()],
    }).catch(console.error);
  }
  scheduleStruktur(m.guild);
});

client.on(Events.GuildMemberUpdate, (oldM, newM) => {
  if (newM.guild.id !== GUILD_ID) return;
  const same = !oldM.partial && oldM.roles.cache.size === newM.roles.cache.size
    && oldM.roles.cache.every((r) => newM.roles.cache.has(r.id));
  if (!same) scheduleStruktur(newM.guild);

  // Role berubah (otomatis atau manual) -> nickname ikut pangkat tertinggi
  if (!same && !oldM.partial && !newM.user.bot && isMember(newM)) {
    applyNick(newM, icNameOf(newM)).then((r) => { if (!r.ok) console.log(`[!] Nickname ${newM.user.username}: ${r.reason}`); });
  }
});
for (const ev of [Events.GuildRoleUpdate, Events.GuildRoleCreate, Events.GuildRoleDelete]) {
  client.on(ev, (r) => { if (r.guild.id === GUILD_ID) scheduleStruktur(r.guild); });
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (!i.guild) return;
    if (i.isChatInputCommand()) {
      if (i.commandName === 'stok') return await handleStok(i);
      if (i.commandName === 'format') return await handleFormat(i);
      if (/^(store|ambil)-/.test(i.commandName)) return await handleGudang(i);
    } else if (i.isButton()) {
      return await handleButton(i);
    } else if (i.isModalSubmit()) {
      return await handleModal(i);
    }
  } catch (e) {
    console.error(e);
    const msg = { content: '⚠️ Terjadi error. Coba lagi atau hubungi staff.', flags: EPH };
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
});

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
if (require.main === module) client.login(TOKEN);
else module.exports = { formatPayloads, parseForm, makeNick, sc, ROLE_STYLE, RANKS, filledBlock, recEmbed, rebuildRecord, formatCommand }; // untuk pengujian
