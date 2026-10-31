// bot.js - Bot utama family GTA SAMP RP
// Fitur: welcome/goodbye, take-role Tamu, request member (OOC + IC + KTP + stats),
//        data-karakter (terima / tolak / koreksi), struktur family otomatis, gudang (/store).
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
  console.error('Isi dulu TOKEN dan GUILD_ID (export TOKEN="MTU1NDg1MzUyMzE1MjMwNjE5Ng.GantCo.zbE3i7spNITWHFXPQf35mAZz1JDa2WjhtFNQXI" ; export GUILD_ID="1565643737420406928").');
  process.exit(1);
}

/* ================= KONFIGURASI (sesuaikan nama jika berbeda) ================= */
const CFG = {
  roles: { tamu: 'Tamu', anggota: 'Anggota', bendahara: 'Bendahara', staff: 'Staff', leader: 'Leader' },
  // bot mencari channel yang namanya MENGANDUNG teks ini
  ch: {
    welcome: 'welcome-goodbye', rules: 'rules-server', takeRole: 'take-role', request: 'request-member', hasil: 'hasil-seleksi',
    data: 'data-karakter', struktur: 'struktur-family', armory: 'data-armory', uang: 'data-uang',
    item: 'data-item', donasi: 'donasi-gudang', log: 'log-bot',
  },
};

// Susunan struktur family (urut dari atas). Tambah rank baru: buat role-nya lalu tambah di CFG.roles & di sini.
const RANKS = [
  { key: 'leader', icon: '👑', title: 'LEADER', desc: 'Pemimpin tertinggi family' },
  { key: 'staff', icon: '🛡️', title: 'STAFF / WAKIL', desc: 'Pengurus dan penjaga aturan' },
  { key: 'bendahara', icon: '💰', title: 'BENDAHARA', desc: 'Pengelola gudang dan keuangan' },
  { key: 'anggota', icon: '🧑‍🤝‍🧑', title: 'ANGGOTA', desc: 'Keluarga besar' },
];

const CATS = {
  armory: { label: 'Armory (Senjata)', icon: '🔫' },
  uang: { label: 'Uang', icon: '💵' },
  obat_haram: { label: 'Obat Haram', icon: '💊' },
  obat_medis: { label: 'Obat Medis', icon: '🩹' },
};

/* ================= PENYIMPANAN DATA (JSON) ================= */
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const load = (n, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, n), 'utf8')); } catch { return def; } };
const save = (n, o) => fs.writeFileSync(path.join(DATA, n), JSON.stringify(o, null, 2));

const pendaftar = load('pendaftar.json', { counter: 0, list: [] });
const gudang = load('gudang.json', { armory: {}, uang: {}, obat_haram: {}, obat_medis: {} });
const panels = load('panels.json', {});
const drafts = new Map(); // userId -> { ooc, ic }

const EPH = MessageFlags.Ephemeral;

/* ================= HELPER ================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const roleOf = (g, key) => g.roles.cache.find((r) => r.name === CFG.roles[key]);
const chanOf = (g, key) => g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.includes(CFG.ch[key]));
const hasRole = (m, key) => { const r = roleOf(m.guild, key); return !!r && m.roles.cache.has(r.id); };
const isStaff = (m) => m.permissions.has(PermissionFlagsBits.Administrator) || hasRole(m, 'staff') || hasRole(m, 'leader');
const isGudang = (m) => isStaff(m) || hasRole(m, 'bendahara');
const isMember = (m) => isGudang(m) || hasRole(m, 'anggota');
const trunc = (s, n = 1000) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
const mention = (g, key) => { const c = chanOf(g, key); return c ? `<#${c.id}>` : `#${CFG.ch[key]}`; };
const num = (n) => Number(n).toLocaleString('id-ID');

async function upsert(key, ch, payload) {
  if (!ch) { console.log(`[!] Channel untuk "${key}" tidak ditemukan.`); return; }
  let msg = null;
  if (panels[key]) msg = await ch.messages.fetch(panels[key]).catch(() => null);
  if (msg) await msg.edit(payload);
  else { msg = await ch.send(payload); panels[key] = msg.id; save('panels.json', panels); }
}

const field = (id, label, style = TextInputStyle.Short, max = 100, placeholder = '') =>
  new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style)
      .setRequired(true).setMaxLength(max).setPlaceholder(placeholder),
  );

/* ================= PANEL: TAKE ROLE & REQUEST MEMBER ================= */
const takePanel = () => ({
  embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🎭 AMBIL ROLE TAMU')
    .setDescription('Tekan tombol di bawah untuk mendapatkan role **Tamu**.\nSetelah itu channel **Public** akan terbuka untukmu.')],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('role:tamu').setLabel('Ambil Role Tamu').setEmoji('🎭').setStyle(ButtonStyle.Success),
  )],
});

const reqPanel = () => ({
  embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('📝 REQUEST MEMBER')
    .setDescription([
      'Ingin bergabung dengan family? Tekan **Daftar Sekarang** lalu ikuti langkahnya:',
      '',
      '**1.** Isi data **OOC**: nama, umur, kesibukan',
      '**2.** Isi data **IC**: nama, umur, level',
      '**3.** Jalankan `/kirim-berkas` lalu lampirkan **screenshot KTP** dan **stats**',
      '',
      'Pastikan kamu sudah membaca syarat di channel syarat-daftar.',
    ].join('\n'))],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('req:start').setLabel('Daftar Sekarang').setEmoji('📝').setStyle(ButtonStyle.Primary),
  )],
});

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
  return new EmbedBuilder().setColor(color).setTitle(`📋 Data Karakter #${rec.id}`)
    .setDescription(`Pendaftar: <@${rec.userId}> (${rec.tag})`)
    .addFields(
      { name: '👤 Data OOC', value: `Nama: **${rec.ooc.nama}**\nUmur: **${rec.ooc.umur}**\nKesibukan: ${rec.ooc.kesibukan}` },
      { name: '🎭 Data IC', value: `Nama: **${rec.ic.nama}**\nUmur: **${rec.ic.umur}**\nLevel: **${rec.ic.level}**` },
      { name: '📌 Status', value: st },
      { name: '🖼️ Berkas', value: 'Screenshot KTP dan stats terlampir di pesan ini.' },
    )
    .setTimestamp(new Date(rec.createdAt));
}

const decisionRow = (id) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`acc:${id}`).setLabel('Terima jadi Anggota').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`rej:${id}`).setLabel('Tolak').setEmoji('❌').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(`cor:${id}`).setLabel('Koreksi').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
);

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
      await member.setNickname(rec.ic.nama.slice(0, 32)).catch(() => {});
    } else extra = '\n(Pendaftar sudah tidak ada di server.)';
  }

  await i.message.edit({ embeds: [recEmbed(rec)], components: [] }).catch(console.error);

  const hasil = chanOf(guild, 'hasil');
  const text = {
    diterima: `✅ **${rec.ic.nama}** diterima sebagai **Anggota**. Selamat bergabung!${extra}`,
    ditolak: `❌ Pendaftaran **${rec.ic.nama}** ditolak.\n**Alasan:** ${rec.note}`,
    koreksi: `✏️ Pendaftaran **${rec.ic.nama}** perlu dikoreksi.\n**Catatan:** ${rec.note}\nSilakan daftar ulang di ${mention(guild, 'request')}.`,
  }[status];
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

/* ================= GUDANG ================= */
function listText(cat) {
  const rows = Object.values(gudang[cat]).filter((x) => x.qty > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return '— kosong —';
  return trunc(rows.map((x) => `• ${x.name} — **${cat === 'uang' ? '$' : ''}${num(x.qty)}**`).join('\n'), 1000);
}

async function renderGudang(guild) {
  const stamp = { text: 'Diperbarui otomatis' };
  await upsert('gudang_armory', chanOf(guild, 'armory'), {
    embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('🔫 STOK ARMORY').setDescription(listText('armory')).setFooter(stamp).setTimestamp()],
  });
  await upsert('gudang_uang', chanOf(guild, 'uang'), {
    embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('💵 KAS UANG').setDescription(listText('uang')).setFooter(stamp).setTimestamp()],
  });
  await upsert('gudang_item', chanOf(guild, 'item'), {
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle('📦 STOK OBAT')
      .addFields({ name: '💊 Obat Haram', value: listText('obat_haram') }, { name: '🩹 Obat Medis', value: listText('obat_medis') })
      .setFooter(stamp).setTimestamp()],
  });
}

async function handleStore(i) {
  const m = i.member;
  const kat = i.options.getString('kategori');
  const jumlah = i.options.getInteger('jumlah');
  const aksi = i.options.getString('aksi') || 'simpan';
  const catatan = i.options.getString('catatan') || '';
  let item = (i.options.getString('item') || '').trim();

  if (!isMember(m)) return i.reply({ content: 'Hanya anggota family yang bisa memakai command ini.', flags: EPH });
  if (aksi === 'ambil' && !isGudang(m)) {
    return i.reply({ content: 'Hanya Bendahara, Staff, dan Leader yang boleh mengambil dari gudang.', flags: EPH });
  }
  if (kat === 'uang' && !item) item = 'Uang';
  if (!item) return i.reply({ content: 'Isi nama item (contoh: Pistol, Marijuana, Medkit).', flags: EPH });

  const key = item.toLowerCase();
  const entry = gudang[kat][key] || { name: item, qty: 0 };
  if (aksi === 'ambil' && entry.qty < jumlah) {
    return i.reply({ content: `Stok **${entry.name}** tidak cukup (tersedia ${num(entry.qty)}).`, flags: EPH });
  }
  entry.qty += aksi === 'simpan' ? jumlah : -jumlah;
  gudang[kat][key] = entry;
  save('gudang.json', gudang);

  const c = CATS[kat];
  const emb = new EmbedBuilder().setColor(aksi === 'simpan' ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`${c.icon} ${aksi === 'simpan' ? 'Simpan ke gudang' : 'Ambil dari gudang'}`)
    .addFields(
      { name: 'Oleh', value: `<@${i.user.id}>`, inline: true },
      { name: 'Kategori', value: c.label, inline: true },
      { name: 'Item', value: `${entry.name} x${kat === 'uang' ? '$' : ''}${num(jumlah)}`, inline: true },
      { name: 'Stok sekarang', value: `${kat === 'uang' ? '$' : ''}${num(entry.qty)}`, inline: true },
    ).setTimestamp();
  if (catatan) emb.addFields({ name: 'Catatan', value: trunc(catatan, 300) });

  const log = chanOf(i.guild, 'log');
  if (log) log.send({ embeds: [emb] }).catch(() => {});
  if (aksi === 'simpan') {
    const don = chanOf(i.guild, 'donasi');
    if (don) don.send({ embeds: [emb] }).catch(() => {});
  }
  await renderGudang(i.guild);
  return i.reply({ content: `✅ Tercatat: ${aksi} **${entry.name}** x${num(jumlah)}.`, flags: EPH });
}

async function handleStok(i) {
  if (!isMember(i.member)) return i.reply({ content: 'Khusus anggota family.', flags: EPH });
  const emb = new EmbedBuilder().setColor(0x3498db).setTitle('📦 STOK GUDANG')
    .addFields(...Object.keys(CATS).map((k) => ({ name: `${CATS[k].icon} ${CATS[k].label}`, value: listText(k) })));
  return i.reply({ embeds: [emb], flags: EPH });
}

/* ================= REQUEST MEMBER: BUTTON & MODAL ================= */
const modalOoc = () => new ModalBuilder().setCustomId('req:ooc').setTitle('Data OOC (1/2)').addComponents(
  field('nama', 'Nama OOC', TextInputStyle.Short, 50, 'Nama aslimu / panggilan'),
  field('umur', 'Umur OOC', TextInputStyle.Short, 2, 'Contoh: 17'),
  field('kesibukan', 'Kesibukan OOC', TextInputStyle.Short, 100, 'Sekolah / kuliah / kerja / dll'),
);
const modalIc = () => new ModalBuilder().setCustomId('req:icm').setTitle('Data IC (2/2)').addComponents(
  field('nama', 'Nama IC', TextInputStyle.Short, 50, 'Nama karakter (Nama_Belakang)'),
  field('umur', 'Umur IC', TextInputStyle.Short, 2, 'Umur karakter'),
  field('level', 'Level IC', TextInputStyle.Short, 4, 'Level karakter'),
);
const modalReason = (prefix, id, title) => new ModalBuilder().setCustomId(`${prefix}:${id}`).setTitle(title)
  .addComponents(field('alasan', 'Alasan / catatan', TextInputStyle.Paragraph, 500));

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

  if (a === 'req' && b === 'start') {
    if (isMember(i.member)) return i.reply({ content: 'Kamu sudah menjadi anggota.', flags: EPH });
    if (pendaftar.list.some((r) => r.userId === i.user.id && r.status === 'pending')) {
      return i.reply({ content: 'Pendaftaranmu masih menunggu keputusan staff.', flags: EPH });
    }
    return i.showModal(modalOoc());
  }

  if (a === 'req' && b === 'ic') {
    if (!drafts.get(i.user.id)?.ooc) return i.reply({ content: 'Mulai lagi dari tombol Daftar Sekarang.', flags: EPH });
    return i.showModal(modalIc());
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
  const val = (k) => i.fields.getTextInputValue(k).trim();

  if (a === 'req' && b === 'ooc') {
    const umur = parseInt(val('umur'), 10);
    if (Number.isNaN(umur) || umur < 5 || umur > 99) return i.reply({ content: 'Umur OOC harus berupa angka yang valid.', flags: EPH });
    drafts.set(i.user.id, { ooc: { nama: val('nama'), umur, kesibukan: val('kesibukan') } });
    return i.reply({
      content: '✅ Data OOC tersimpan. Lanjut isi data IC:',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('req:ic').setLabel('Lanjut: Isi Data IC').setStyle(ButtonStyle.Primary),
      )],
      flags: EPH,
    });
  }

  if (a === 'req' && b === 'icm') {
    const d = drafts.get(i.user.id);
    if (!d?.ooc) return i.reply({ content: 'Mulai lagi dari tombol Daftar Sekarang.', flags: EPH });
    const umur = parseInt(val('umur'), 10); const level = parseInt(val('level'), 10);
    if (Number.isNaN(umur) || Number.isNaN(level) || level < 1) {
      return i.reply({ content: 'Umur dan level IC harus berupa angka. Tekan "Lanjut: Isi Data IC" untuk mengulang.', flags: EPH });
    }
    d.ic = { nama: val('nama'), umur, level };
    return i.reply({
      content: '✅ Data IC tersimpan.\n\n**Langkah terakhir:** ketik `/kirim-berkas` lalu lampirkan **screenshot KTP** dan **stats** karaktermu.',
      flags: EPH,
    });
  }

  if (a === 'rejm' || a === 'corm') {
    if (!isStaff(i.member)) return i.reply({ content: 'Tidak punya izin.', flags: EPH });
    await i.deferUpdate();
    return decide(i, Number(b), a === 'rejm' ? 'ditolak' : 'koreksi', val('alasan'));
  }
}

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

async function handleBerkas(i) {
  const d = drafts.get(i.user.id);
  if (!d?.ooc || !d?.ic) {
    return i.reply({ content: `Isi dulu data OOC dan IC lewat tombol **Daftar Sekarang** di ${mention(i.guild, 'request')}.`, flags: EPH });
  }
  if (isMember(i.member)) return i.reply({ content: 'Kamu sudah menjadi anggota.', flags: EPH });
  const dataCh = chanOf(i.guild, 'data');
  if (!dataCh) return i.reply({ content: 'Channel data-karakter tidak ditemukan. Hubungi admin.', flags: EPH });

  const ktp = i.options.getAttachment('ktp');
  const stats = i.options.getAttachment('stats');
  for (const a of [ktp, stats]) {
    if (!EXT[a.contentType?.split(';')[0]]) return i.reply({ content: 'Berkas harus berupa gambar (PNG/JPG/WEBP).', flags: EPH });
    if (a.size > 8 * 1024 * 1024) return i.reply({ content: 'Ukuran gambar maksimal 8 MB.', flags: EPH });
  }
  await i.deferReply({ flags: EPH });

  const id = pendaftar.counter + 1;
  const files = []; const names = {};
  for (const [label, a] of [['ktp', ktp], ['stats', stats]]) {
    const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
    const fname = `${id}-${label}${EXT[a.contentType.split(';')[0]]}`;
    fs.writeFileSync(path.join(UPLOADS, fname), buf);
    files.push(new AttachmentBuilder(buf, { name: fname }));
    names[label] = fname;
  }

  const rec = {
    id, userId: i.user.id, tag: i.user.username, ooc: d.ooc, ic: d.ic,
    ktp: names.ktp, stats: names.stats, status: 'pending', note: '', createdAt: new Date().toISOString(),
  };
  const msg = await dataCh.send({ embeds: [recEmbed(rec)], components: [decisionRow(id)], files });
  rec.messageId = msg.id;
  pendaftar.counter = id;
  pendaftar.list.push(rec);
  save('pendaftar.json', pendaftar);
  drafts.delete(i.user.id);
  return i.editReply('✅ Pendaftaran terkirim! Staff akan memeriksa datamu. Pantau hasilnya di channel hasil-seleksi.');
}

/* ================= COMMAND SLASH ================= */
const COMMANDS = [
  new SlashCommandBuilder().setName('store').setDescription('Simpan / ambil barang di gudang family')
    .addStringOption((o) => o.setName('kategori').setDescription('Kategori barang').setRequired(true)
      .addChoices(...Object.entries(CATS).map(([value, c]) => ({ name: c.label, value }))))
    .addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah').setMinValue(1).setRequired(true))
    .addStringOption((o) => o.setName('item').setDescription('Nama item (kosongkan untuk uang)').setMaxLength(60))
    .addStringOption((o) => o.setName('aksi').setDescription('Simpan atau ambil (default: simpan)')
      .addChoices({ name: 'Simpan', value: 'simpan' }, { name: 'Ambil', value: 'ambil' }))
    .addStringOption((o) => o.setName('catatan').setDescription('Catatan tambahan').setMaxLength(200)),
  new SlashCommandBuilder().setName('stok').setDescription('Lihat stok gudang family'),
  new SlashCommandBuilder().setName('kirim-berkas').setDescription('Kirim screenshot KTP dan stats untuk pendaftaran')
    .addAttachmentOption((o) => o.setName('ktp').setDescription('Screenshot KTP').setRequired(true))
    .addAttachmentOption((o) => o.setName('stats').setDescription('Screenshot stats').setRequired(true)),
].map((c) => c.toJSON());

/* ================= EVENT ================= */
client.once(Events.ClientReady, async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch(); await guild.channels.fetch();
  await guild.commands.set(COMMANDS);
  await upsert('take', chanOf(guild, 'takeRole'), takePanel());
  await upsert('req', chanOf(guild, 'request'), reqPanel());
  await updateStruktur(guild);
  await renderGudang(guild);
  console.log(`Bot aktif sebagai ${client.user.tag}`);
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
      if (i.commandName === 'store') return await handleStore(i);
      if (i.commandName === 'stok') return await handleStok(i);
      if (i.commandName === 'kirim-berkas') return await handleBerkas(i);
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
