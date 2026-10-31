// bot.js - Bot utama family GTA SAMP RP (versi 2)
// Fitur: welcome/goodbye, take-role Tamu, request member via format teks,
//        data-karakter (terima / tolak / koreksi), struktur family otomatis,
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
  roles: { tamu: 'Tamu', anggota: 'Anggota', bendahara: 'Bendahara', staff: 'Staff', leader: 'Leader' },
  // bot mencari channel yang namanya MENGANDUNG teks ini (boleh lebih dari satu kandidat)
  ch: {
    welcome: 'welcome-goodbye', rules: 'rules-server', takeRole: 'take-role', request: 'request-member',
    hasil: 'hasil-seleksi', data: 'data-karakter', struktur: 'struktur-family',
    armory: 'data-armory', uang: 'data-uang', obat: ['data-obat', 'data-item'],
    log: 'log-bot',
  },
  gudangCategory: 'GUDANG',   // /stok hanya bisa dipakai di channel dalam kategori ini
  deleteSubmission: true,     // hapus pesan pendaftaran member setelah datanya diteruskan ke data-karakter
};

const RANKS = [
  { key: 'leader', icon: '👑', title: 'LEADER', desc: 'Pemimpin tertinggi family' },
  { key: 'staff', icon: '🛡️', title: 'STAFF / WAKIL', desc: 'Pengurus dan penjaga aturan' },
  { key: 'bendahara', icon: '💰', title: 'BENDAHARA', desc: 'Pengelola gudang dan keuangan' },
  { key: 'anggota', icon: '🧑‍🤝‍🧑', title: 'ANGGOTA', desc: 'Keluarga besar' },
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

const FORMAT_BLOCK = [
  '━━ DATA DISCORD ━━',
  'Nickname Discord :',
  '',
  '━━ DATA OOC ━━',
  'Nama OOC         :',
  'Umur OOC         :',
  'Kesibukan OOC    :',
  '',
  '━━ DATA IC ━━',
  'Nama IC          :',
  'Umur IC          :',
  'Tanggal Lahir IC :',
  '',
  '━━ MOTIVASI ━━',
  'Alasan ingin masuk :',
  'Visi               :',
  'Misi               :',
  '',
  '━━ KEAKTIFAN ━━',
  'Waktu bermain (Pagi/Siang/Sore/Malam) :',
  'Durasi bermain / masuk kota per hari  :',
  'Aktif setiap hari? (Ya/Tidak)         :',
].join('\n');

const formatPayload = () => ({
  content: [
    '📝 **FORMAT PENDAFTARAN MEMBER**',
    'Salin format di bawah, isi semua kolom, lalu kirim di channel ini **bersama 2 lampiran gambar dalam satu pesan**:',
    '**(1)** screenshot **KTP**  •  **(2)** screenshot **Stats**',
    '',
    '```',
    FORMAT_BLOCK,
    '```',
    '⚠️ Semua kolom wajib diisi. Jangan ubah nama kolom.',
  ].join('\n'),
});

const normLabel = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

function parseForm(text) {
  const out = {}; let cur = null;
  for (const raw of text.replace(/```/g, '').split(/\r?\n/)) {
    const line = raw.replace(/[*~`]/g, '').trim(); // underscore dipertahankan (Nama_Belakang)
    const m = line.match(/^([^:：]{2,70}?)\s*[:：]\s*(.*)$/);
    if (m) {
      const n = normLabel(m[1]);
      const hit = FORM_FIELDS.find(([, l]) => n.startsWith(l));
      if (hit) { cur = hit[0]; out[cur] = m[2].trim(); continue; }
    }
    if (cur && line && !/^[━─=\-–]/.test(line)) out[cur] += (out[cur] ? '\n' : '') + line;
  }
  return out;
}

/* ================= PENYIMPANAN DATA (JSON) ================= */
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const load = (n, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, n), 'utf8')); } catch { return def; } };
const save = (n, o) => fs.writeFileSync(path.join(DATA, n), JSON.stringify(o, null, 2));

const pendaftar = load('pendaftar.json', { counter: 0, list: [] });
const gudang = load('gudang.json', { armory: {}, uang: {}, obat: {} });
const panels = load('panels.json', {});
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

const roleOf = (g, key) => g.roles.cache.find((r) => r.name === CFG.roles[key]);
const chanOf = (g, key) => {
  const names = [].concat(CFG.ch[key]);
  return g.channels.cache.find((c) => c.type === ChannelType.GuildText && names.some((n) => c.name.includes(n)));
};
const hasRole = (m, key) => { const r = roleOf(m.guild, key); return !!r && m.roles.cache.has(r.id); };
const isStaff = (m) => m.permissions.has(PermissionFlagsBits.Administrator) || hasRole(m, 'staff') || hasRole(m, 'leader');
const isGudang = (m) => isStaff(m) || hasRole(m, 'bendahara');
const isMember = (m) => isGudang(m) || hasRole(m, 'anggota');
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
  embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🎭 AMBIL ROLE TAMU')
    .setDescription('Tekan tombol di bawah untuk mendapatkan role **Tamu**.\nSetelah itu channel **Public** akan terbuka untukmu.')],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('role:tamu').setLabel('Ambil Role Tamu').setEmoji('🎭').setStyle(ButtonStyle.Success),
  )],
});

/* ================= REQUEST MEMBER (format teks) ================= */
let fmtTimer;
function scheduleFormat(guild) {
  clearTimeout(fmtTimer);
  fmtTimer = setTimeout(() => bumpFormat(guild).catch(console.error), 1500);
}
async function bumpFormat(guild) {
  await bump('req_format', chanOf(guild, 'request'), formatPayload());
}

const busy = new Set();

async function handleRequestMessage(msg) {
  const guild = msg.guild;
  const author = msg.member || await guild.members.fetch(msg.author.id).catch(() => null);
  if (!author || isMember(author)) return; // anggota/staff yang ngobrol biasa, bukan pendaftar

  const warn = async (text) => {
    const w = await msg.reply({ content: text, allowedMentions: { repliedUser: false } }).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 20000);
  };

  const f = parseForm(msg.content || '');
  const imgs = [...msg.attachments.values()].filter((a) => EXT[(a.contentType || '').split(';')[0]]);
  if (!Object.keys(f).length && !imgs.length) return; // obrolan biasa

  if (pendaftar.list.some((r) => r.userId === msg.author.id && r.status === 'pending')) {
    return warn('⏳ Pendaftaranmu masih menunggu keputusan staff.');
  }
  const missing = FORM_FIELDS.filter(([k]) => !f[k] || !f[k].trim()).map(([, , name]) => name);
  const problems = [];
  if (missing.length) problems.push(`Kolom belum diisi: **${missing.join(', ')}**`);
  if (imgs.length < 2) problems.push('Lampirkan **2 gambar** dalam pesan yang sama: (1) KTP, (2) Stats.');
  if (problems.length) return warn(`❌ <@${msg.author.id}> pendaftaran belum lengkap:\n${problems.join('\n')}\nSilakan kirim ulang.`);
  if (imgs.slice(0, 2).some((a) => a.size > 8 * 1024 * 1024)) return warn('❌ Ukuran gambar maksimal 8 MB per file.');

  const dataCh = chanOf(guild, 'data');
  if (!dataCh) return warn('⚠️ Channel data-karakter tidak ditemukan. Hubungi admin.');
  if (busy.has(msg.author.id)) return;
  busy.add(msg.author.id);
  try {
    const id = pendaftar.counter + 1;
    const files = []; const names = {};
    for (const [n, label] of [[0, 'ktp'], [1, 'stats']]) {
      const a = imgs[n];
      const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
      const fname = `${id}-${label}${EXT[a.contentType.split(';')[0]]}`;
      fs.writeFileSync(path.join(UPLOADS, fname), buf);
      files.push(new AttachmentBuilder(buf, { name: fname }));
      names[label] = fname;
    }
    const fields = {};
    for (const [k] of FORM_FIELDS) fields[k] = trunc(f[k].trim(), 1500);

    const rec = {
      id, userId: msg.author.id, tag: msg.author.username, f: fields, raw: trunc(msg.content, 3500),
      ktp: names.ktp, stats: names.stats, status: 'pending', note: '', createdAt: new Date().toISOString(),
    };
    const sent = await dataCh.send({ embeds: [recEmbed(rec)], components: [decisionRow(id)], files });
    rec.messageId = sent.id;
    pendaftar.counter = id;
    pendaftar.list.push(rec);
    save('pendaftar.json', pendaftar);

    if (CFG.deleteSubmission) await msg.delete().catch(() => {});
    const ok = await msg.channel.send(`✅ <@${msg.author.id}> pendaftaranmu terkirim! Pantau hasilnya di ${mention(guild, 'hasil')}.`).catch(() => null);
    if (ok) setTimeout(() => ok.delete().catch(() => {}), 15000);
  } finally {
    busy.delete(msg.author.id);
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
  const f = rec.f;
  let st = label;
  if (rec.note) st += `\n**Catatan:** ${trunc(rec.note, 400)}`;
  if (rec.handledBy) st += `\n**Diproses oleh:** <@${rec.handledBy}>`;
  return new EmbedBuilder().setColor(color).setTitle(`📋 Data Karakter #${rec.id}`)
    .setDescription(`Pendaftar: <@${rec.userId}> (${rec.tag})\nNickname Discord: **${trunc(f.nickname, 60)}**`)
    .addFields(
      { name: '👤 Data OOC', value: `Nama: **${trunc(f.nama_ooc, 80)}**\nUmur: **${trunc(f.umur_ooc, 10)}**\nKesibukan: ${trunc(f.kesibukan, 150)}` },
      { name: '🎭 Data IC', value: `Nama: **${trunc(f.nama_ic, 80)}**\nUmur: **${trunc(f.umur_ic, 10)}**\nTanggal lahir: **${trunc(f.tgl_lahir, 30)}**` },
      { name: '💬 Alasan ingin masuk', value: trunc(f.alasan, 700) },
      { name: '🎯 Visi', value: trunc(f.visi, 500) },
      { name: '🚩 Misi', value: trunc(f.misi, 500) },
      { name: '⏰ Keaktifan', value: `Waktu: ${trunc(f.waktu, 80)}\nDurasi: ${trunc(f.durasi, 100)}\nAktif setiap hari: ${trunc(f.aktif, 30)}` },
      { name: '📌 Status', value: st },
      { name: '🖼️ Berkas', value: 'Lampiran 1: KTP • Lampiran 2: Stats (terlampir di pesan ini).' },
    )
    .setTimestamp(new Date(rec.createdAt));
}

const decisionRow = (id) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`acc:${id}`).setLabel('Terima jadi Anggota').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`rej:${id}`).setLabel('Tolak').setEmoji('❌').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(`cor:${id}`).setLabel('Koreksi').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
);

const modalReason = (prefix, id, title) => new ModalBuilder().setCustomId(`${prefix}:${id}`).setTitle(title)
  .addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('alasan').setLabel('Alasan / catatan').setStyle(TextInputStyle.Paragraph)
      .setRequired(true).setMaxLength(500),
  ));

async function decide(i, id, status, note) {
  const rec = pendaftar.list.find((r) => r.id === id);
  if (!rec || rec.status !== 'pending') {
    return i.followUp({ content: 'Data ini sudah diproses sebelumnya.', flags: EPH });
  }
  const guild = i.guild;
  rec.status = status;
  rec.note = note || '';
  rec.handledBy = i.user.id;
  rec.handledAt = new Date().toISOString();
  save('pendaftar.json', pendaftar);

  const member = await guild.members.fetch(rec.userId).catch(() => null);
  let extra = '';
  if (status === 'diterima') {
    if (member) {
      const a = roleOf(guild, 'anggota'); const t = roleOf(guild, 'tamu');
      if (a) await member.roles.add(a).catch(console.error);
      if (t) await member.roles.remove(t).catch(() => {});
      await member.setNickname(rec.f.nama_ic.slice(0, 32)).catch(() => {});
    } else extra = '\n(Pendaftar sudah tidak ada di server.)';
  }

  await i.message.edit({ embeds: [recEmbed(rec)], components: [] }).catch(console.error);

  const nama = rec.f.nama_ic;
  const text = {
    diterima: `✅ **${nama}** diterima sebagai **Anggota**. Selamat bergabung!${extra}`,
    ditolak: `❌ Pendaftaran **${nama}** ditolak.\n**Alasan:** ${rec.note}`,
    koreksi: `✏️ Pendaftaran **${nama}** perlu dikoreksi.\n**Catatan:** ${rec.note}\nSilakan kirim ulang format di ${mention(guild, 'request')}.`,
  }[status];
  const hasil = chanOf(guild, 'hasil');
  if (hasil) {
    await hasil.send({
      content: `<@${rec.userId}>`,
      embeds: [new EmbedBuilder().setColor(STATUS[status][1]).setTitle(`Hasil Seleksi #${rec.id}`).setDescription(text).setTimestamp()],
    }).catch(console.error);
  }
  if (member) member.send(`Hasil pendaftaran di **${guild.name}**:\n${text}`).catch(() => {});
  scheduleStruktur(guild);
}

/* ================= STRUKTUR FAMILY (otomatis) ================= */
async function updateStruktur(guild) {
  const ch = chanOf(guild, 'struktur');
  if (!ch) return;
  await guild.members.fetch().catch(console.error);
  const groups = Object.fromEntries(RANKS.map((r) => [r.key, []]));
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    const top = RANKS.find((r) => hasRole(m, r.key));
    if (top) groups[top.key].push(m.id);
  }
  const total = RANKS.reduce((n, r) => n + groups[r.key].length, 0);
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`🏴 STRUKTUR ${guild.name.toUpperCase()}`)
    .setDescription('━━━━━━━━━━━━━━━━━━━━━━\nSusunan family diperbarui **otomatis** saat role berubah.\n━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of RANKS) {
    const ids = groups[r.key];
    let list = ids.map((id) => `• <@${id}>`).join('\n');
    if (list.length > 900) {
      let shown = 0; let acc = '';
      for (const id of ids) { const line = `• <@${id}>\n`; if ((acc + line).length > 850) break; acc += line; shown++; }
      list = `${acc}... +${ids.length - shown} lainnya`;
    }
    embed.addFields({ name: `${r.icon} ${r.title}  •  ${ids.length}`, value: `*${r.desc}*\n${list || '— kosong —'}` });
  }
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
  return trunc(rows.map((x) => `• ${x.name} — **${GUDANG[k].money ? '$' : ''}${num(x.qty)}**`).join('\n'), 3800);
}

const gudangPanel = (k) => {
  const g = GUDANG[k];
  return {
    embeds: [new EmbedBuilder().setColor(g.color).setTitle(`${g.icon} STOK ${g.label.toUpperCase()}`)
      .setDescription(listText(k))
      .setFooter({ text: `Simpan: /store-${k}  •  Ambil: /ambil-${k}` }).setTimestamp()],
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
    return i.reply({ content: 'Hanya Bendahara, Staff, dan Leader yang boleh mengambil dari gudang.', flags: EPH });
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
    .setTitle(`${g.icon} ${verb === 'store' ? 'Simpan ke gudang' : 'Ambil dari gudang'}`)
    .addFields(
      { name: 'Oleh', value: `<@${i.user.id}>`, inline: true },
      { name: 'Item', value: g.money ? `${cur}${num(jumlah)}` : `${entry.name} x${num(jumlah)}`, inline: true },
      { name: 'Stok sekarang', value: `${cur}${num(entry.qty)}`, inline: true },
    ).setTimestamp();
  if (catatan) emb.addFields({ name: 'Catatan', value: trunc(catatan, 300) });

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
  const emb = new EmbedBuilder().setColor(0x3498db).setTitle('📦 STOK GUDANG')
    .addFields(...Object.entries(GUDANG).map(([k, g]) => ({ name: `${g.icon} ${g.label}`, value: trunc(listText(k), 1000) })));
  return i.reply({ embeds: [emb], flags: EPH });
}

/* ================= TOMBOL & MODAL ================= */
async function handleButton(i) {
  const [a, b] = i.customId.split(':');

  if (a === 'role') {
    const t = roleOf(i.guild, 'tamu');
    if (!t) return i.reply({ content: 'Role Tamu belum ada. Hubungi admin.', flags: EPH });
    if (isMember(i.member)) return i.reply({ content: 'Kamu sudah punya akses lebih tinggi dari Tamu.', flags: EPH });
    if (i.member.roles.cache.has(t.id)) return i.reply({ content: 'Kamu sudah punya role Tamu.', flags: EPH });
    await i.member.roles.add(t);
    return i.reply({ content: '✅ Role **Tamu** diberikan. Channel Public sekarang terbuka!', flags: EPH });
  }

  if (['acc', 'rej', 'cor'].includes(a)) {
    if (!isStaff(i.member)) return i.reply({ content: 'Hanya Staff dan Leader yang bisa memproses pendaftaran.', flags: EPH });
    const id = Number(b);
    if (a === 'acc') { await i.deferUpdate(); return decide(i, id, 'diterima', ''); }
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

  // bersihkan panel versi lama (tombol request member & panel obat lama)
  await dropPanel('req', chanOf(guild, 'request'));
  await dropPanel('gudang_item', chanOf(guild, 'obat'));
  await dropPanel('gudang_obat_haram', chanOf(guild, 'obat'));

  await upsert('take', chanOf(guild, 'takeRole'), takePanel());

  const req = chanOf(guild, 'request');
  if (req) {
    const last = (await req.messages.fetch({ limit: 1 }).catch(() => null))?.first();
    if (!last || last.id !== panels.req_format) await bumpFormat(guild);
  }

  await updateStruktur(guild);
  await renderGudang(guild);
  console.log(`Bot aktif sebagai ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (msg) => {
  if (!msg.guild || msg.guild.id !== GUILD_ID || msg.author.bot || msg.system) return;
  const req = chanOf(msg.guild, 'request');
  if (!req || msg.channelId !== req.id) return;
  try {
    await handleRequestMessage(msg);
  } catch (e) {
    console.error(e);
  } finally {
    scheduleFormat(msg.guild); // format kosong dikirim ulang di paling bawah
  }
});

client.on(Events.GuildMemberAdd, async (m) => {
  if (m.guild.id !== GUILD_ID) return;
  const ch = chanOf(m.guild, 'welcome');
  if (ch) {
    ch.send({
      content: `${m}`,
      embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('👋 SELAMAT DATANG!')
        .setDescription([
          `Halo ${m}, selamat datang di **${m.guild.name}**!`, '',
          `1️⃣ Baca aturan di ${mention(m.guild, 'rules')}`,
          `2️⃣ Ambil role Tamu di ${mention(m.guild, 'takeRole')}`,
          `3️⃣ Daftar jadi member di ${mention(m.guild, 'request')}`,
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
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('👋 SAMPAI JUMPA')
        .setDescription(`**${m.user.username}** telah meninggalkan server.`)
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
});
for (const ev of [Events.GuildRoleUpdate, Events.GuildRoleCreate, Events.GuildRoleDelete]) {
  client.on(ev, (r) => { if (r.guild.id === GUILD_ID) scheduleStruktur(r.guild); });
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (!i.guild) return;
    if (i.isChatInputCommand()) {
      if (i.commandName === 'stok') return await handleStok(i);
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
client.login(TOKEN);
