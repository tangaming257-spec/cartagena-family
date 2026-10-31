// setup-server.js - CARTAGENA FAMILY (GTA SAMP RP)
// Membuat otomatis: role, kategori, channel, izin akses, dan pesan rules.
// - Role lama yang TIDAK ada di daftar baru akan DIHAPUS (kecuali role bot/integrasi).
// - Kategori & channel lama diganti namanya (bukan dibuat dobel), izinnya diperbarui.
// Aman dijalankan ulang.

const {
  Client, GatewayIntentBits, ChannelType, Events,
  PermissionFlagsBits: P, EmbedBuilder,
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !GUILD_ID) {
  console.error('Isi dulu TOKEN dan GUILD_ID. Contoh:\n  export TOKEN="isi_token"\n  export GUILD_ID="isi_id_server"');
  process.exit(1);
}

/* ================= 1. ROLE (urut dari TERTINGGI ke terendah) =================
   Nama role HARUS sama dengan yang ada di bot.js (ROLE_STYLE).
   staff: true = role pengurus (bisa melihat & menulis di semua channel, termasuk channel Pengurus) */
const MOD_PERMS = [P.KickMembers, P.ManageMessages, P.ModerateMembers, P.ManageNicknames, P.MoveMembers, P.MuteMembers];
const TOP_PERMS = [...MOD_PERMS, P.BanMembers];

const ROLES = [
  // RANK 1 - Kepala Keluarga
  { key: 'bigpapa', name: '👑 Big Papa', color: 0xf1c40f, hoist: true, staff: true, perms: TOP_PERMS },
  { key: 'bigmama', name: '👑 Big Mama', color: 0xe91e8c, hoist: true, staff: true, perms: TOP_PERMS },
  // RANK 2 - Pewaris
  { key: 'tuanmuda', name: '🎩 Tuan Muda', color: 0x9b59b6, hoist: true, staff: true, perms: TOP_PERMS },
  { key: 'nonamuda', name: '🎀 Nona Muda', color: 0xff69b4, hoist: true, staff: true, perms: TOP_PERMS },
  // Pengurus
  { key: 'moderator', name: '🛡️ Moderator', color: 0xe67e22, hoist: true, staff: true, perms: MOD_PERMS },
  { key: 'pengurus', name: '📋 Pengurus Komunitas', color: 0x1abc9c, hoist: true, staff: true, perms: MOD_PERMS },
  { key: 'bendahara', name: '💰 Bendahara', color: 0x2ecc71, hoist: true },
  // RANK 3 - Dewan Kakak
  { key: 'bigbrother', name: '🧔 Big Brother', color: 0x3498db, hoist: true },
  { key: 'bigsister', name: '👩 Big Sister', color: 0xe84393, hoist: true },
  // RANK 4 - Anggota biasa
  { key: 'prince', name: '🤵 Prince', color: 0x5dade2, hoist: true },
  { key: 'queen', name: '🌸 Queen', color: 0xf48fb1, hoist: true },
  // Tag
  { key: 'familycf', name: '🏠 Family CF', color: 0x7f8c8d },
  { key: 'verifiedcf', name: '✅ Verified CF', color: 0x1f8b4c },
  { key: 'tamu', name: '🎭 Tamu', color: 0x95a5a6 },
];

/* ================= 2. STRUKTUR KATEGORI & CHANNEL =================
   old     : nama lama (kategori/channel lama akan di-rename, bukan dibuat dobel)
   view    : 'everyone', 'tamu', 'family' (= role Family CF). Role pengurus selalu bisa.
   mode    : 'ro' = hanya baca, 'chat' = boleh kirim pesan
   writers : role tambahan yang boleh menulis di channel read-only
   voice   : true = voice channel
   post    : isi pesan otomatis (lihat POSTS)                                              */
const VIEW_ROLES = { tamu: ['tamu'], family: ['familycf'] };

const STRUCTURE = [
  {
    name: '🏠 INFORMASI', old: ['❖ WELCOME ❖'], view: ['everyone'], channels: [
      { name: '👋・welcome-goodbye' },
      { name: '📜・rules-server', post: 'rulesServer' },
      { name: '🎭・take-role' },
      { name: '🏠・tentang-komunitas', old: ['🏴・tentang-komunitas'], post: 'tentang' },
    ],
  },
  {
    name: '🌐 UMUM', old: ['❖ PUBLIC ❖'], view: ['tamu', 'family'], channels: [
      { name: '💬・chat-public', mode: 'chat' },
      { name: '📌・syarat-daftar', post: 'syarat' },
      { name: '📝・request-member', mode: 'chat' },
      { name: '✅・hasil-seleksi' },
      { name: '💡・saran-bug', mode: 'chat' },
    ],
  },
  {
    name: '👨‍👩‍👧‍👦 CARTAGENA FAMILY', old: ['❖ ANGGOTA ❖'], view: ['family'], channels: [
      { name: '📢・announcement' },
      { name: '📜・rules-family', post: 'rulesFamily' },
      { name: '📘・guide-family' },
      { name: '👑・struktur-family' },
      { name: '🖼️・logo-family' },
      { name: '💬・chat-family', old: ['💬・chat-anggota'], mode: 'chat' },
      { name: '🗓️・jadwal-absensi' },
      { name: '📩・izin-cuti', mode: 'chat' },
      { name: '📸・screenshot-rp', mode: 'chat' },
      { name: '🎬・video-aktivitas', old: ['🎬・video-jj-aktivitas'], mode: 'chat' },
      { name: '🏡・lokasi-rumah-family', old: ['📍・lokasi-hood'], mode: 'chat' },
      { name: '🌿・lokasi-farming', old: ['🌿・lokasi-private-farm'], mode: 'chat' },
    ],
  },
  {
    name: '📖 CERITA FAMILY', old: ['❖ STORY FAMILY ❖'], view: ['family'], channels: [
      { name: '📖・sejarah-family' },
      { name: '📜・storyline-rp' },
      { name: '🎯・rencana-ide-cerita', mode: 'chat' },
      { name: '🖼️・galeri-momen', mode: 'chat' },
    ],
  },
  {
    name: '📦 GUDANG FAMILY', old: ['❖ GUDANG ❖'], view: ['family'], channels: [
      { name: '🔫・data-senjata', old: ['🔫・data-armory'], writers: ['bendahara'] },
      { name: '💵・data-uang', writers: ['bendahara'] },
      { name: '💊・data-obat', old: ['💊・data-item'], writers: ['bendahara'] },
      { name: '💰・donasi-gudang', mode: 'chat' },
    ],
  },
  {
    name: '⚠️ DISIPLIN', old: ['❖ PELANGGARAN ❖'], view: ['family'], channels: [
      { name: '⚠️・warn-anggota' },
      { name: '📋・daftar-sanksi', old: ['🚫・blacklist'] },
      { name: '📩・klarifikasi', mode: 'chat' },
      { name: '🔊・voice-klarifikasi', voice: true },
    ],
  },
  {
    name: '🛠️ PENGURUS', old: ['❖ STAFF ❖'], view: [], channels: [
      { name: '🗂️・data-karakter' },
      { name: '🛠️・chat-pengurus', old: ['🛠️・chat-staff'], mode: 'chat' },
      { name: '🧾・log-bot' },
    ],
  },
  {
    name: '🔊 VOICE', old: ['❖ VOICE ❖'], view: ['family'], channels: [
      { name: '🔊・lobby', voice: true },
      { name: '🏠・meeting family', old: ['🏴・meeting family'], voice: true },
      { name: '🎙️・in city', voice: true },
      { name: '🌙・afk', voice: true },
    ],
  },
];

/* ================= 3. ISI PESAN OTOMATIS (silakan edit) ================= */
const POSTS = {
  rulesServer: {
    title: '📜 PERATURAN SERVER',
    desc: [
      '**1.** Hormati sesama. Dilarang toxic, rasis, dan SARA.',
      '**2.** Dilarang cheat, hack, mod ilegal, dan bug abuse.',
      '**3.** Dilarang RDM, VDM, car DM, dan DM tanpa alasan IC.',
      '**4.** Dilarang metagaming dan powergaming.',
      '**5.** Jaga karakter. Bedakan IC dan OOC, hindari fail RP.',
      '**6.** Dilarang spam, iklan, dan menyebar link tanpa izin pengurus.',
      '**7.** Patuhi arahan Moderator dan Pengurus.',
      '**8.** Pelanggaran dapat dikenai warn, kick, atau banned.',
    ].join('\n'),
  },
  rulesFamily: {
    title: '📜 PERATURAN CARTAGENA FAMILY (contoh, silakan ubah)',
    desc: [
      '**1.** Hormati Big Papa, Big Mama, dan seluruh anggota family.',
      '**2.** Wajib aktif dan ikut meeting family mingguan.',
      '**3.** Tidak aktif? Wajib lapor di #izin-cuti.',
      '**4.** Dilarang menyebar data gudang dan urusan internal family.',
      '**5.** Masalah pribadi tidak dibawa ke dalam family.',
      '**6.** 3 warn = dikeluarkan dari family.',
    ].join('\n'),
  },
  syarat: {
    title: '📌 SYARAT & TATA CARA DAFTAR',
    desc: '*(Isi syarat dan tata cara pendaftaran di sini. Edit pesan ini atau hapus lalu tulis ulang.)*',
  },
  tentang: {
    title: '🏠 TENTANG CARTAGENA FAMILY',
    desc: '*(Isi profil dan deskripsi komunitas di sini.)*',
  },
};

/* ================= 4. IZIN AKSES ================= */
const READ = [P.ViewChannel, P.ReadMessageHistory];
const WRITE = [P.SendMessages, P.SendMessagesInThreads, P.AttachFiles, P.EmbedLinks, P.AddReactions];
const WRITE_DENY = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions];
const VOICE = [P.ViewChannel, P.Connect, P.Speak, P.UseVAD];

let EVERYONE;
const R = {};
const STAFF_KEYS = ROLES.filter((r) => r.staff).map((r) => r.key);

function buildOverwrites(view, mode, writers, isVoice) {
  const ow = [];
  if (view.includes('everyone')) {
    ow.push({ id: EVERYONE, allow: READ, deny: WRITE_DENY });
  } else {
    ow.push({ id: EVERYONE, deny: [P.ViewChannel] });
  }
  for (const v of view) {
    if (v === 'everyone') continue;
    for (const k of VIEW_ROLES[v]) {
      if (isVoice) ow.push({ id: R[k].id, allow: VOICE });
      else if (mode === 'chat') ow.push({ id: R[k].id, allow: [...READ, ...WRITE] });
      else ow.push({ id: R[k].id, allow: READ, deny: WRITE_DENY });
    }
  }
  for (const k of writers) ow.push({ id: R[k].id, allow: [...READ, ...WRITE] });
  for (const k of STAFF_KEYS) {
    ow.push({
      id: R[k].id,
      allow: isVoice ? [...VOICE, P.MuteMembers, P.MoveMembers] : [...READ, ...WRITE],
    });
  }
  return ow;
}

async function postOnce(channel, data) {
  const last = await channel.messages.fetch({ limit: 1 });
  if (last.size > 0) return;
  const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.desc).setColor(0x2b2d31);
  await channel.send({ embeds: [embed] });
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, '-');

/* ================= 5. JALANKAN ================= */
async function main(client) {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();
  EVERYONE = guild.roles.everyone.id;

  /* --- Role baru --- */
  console.log('Membuat role baru...');
  for (const r of ROLES) {
    let role = guild.roles.cache.find((x) => x.name === r.name);
    if (!role) {
      role = await guild.roles.create({
        name: r.name, color: r.color, hoist: !!r.hoist, permissions: r.perms || [], reason: 'Setup Cartagena Family',
      });
    } else {
      await role.edit({ color: r.color, hoist: !!r.hoist, permissions: r.perms || [] }).catch(() => {});
    }
    R[r.key] = role;
  }

  /* --- Kategori & channel (dibuat/rename dulu supaya riwayat chat tidak hilang) --- */
  for (const cat of STRUCTURE) {
    console.log('Kategori:', cat.name);
    const catOw = buildOverwrites(cat.view, 'ro', [], false);
    const catNames = [cat.name, ...(cat.old || [])];
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && catNames.includes(c.name),
    );
    if (!category) {
      category = await guild.channels.create({
        name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites: catOw,
      });
    } else {
      if (category.name !== cat.name) await category.setName(cat.name).catch(() => {});
      await category.permissionOverwrites.set(catOw);
    }

    for (const ch of cat.channels) {
      const isVoice = !!ch.voice;
      const ow = buildOverwrites(cat.view, ch.mode || 'ro', ch.writers || [], isVoice);
      const wanted = [ch.name, ...(ch.old || [])].map((n) => (isVoice ? n : norm(n)).toLowerCase());
      // cari di kategori ini dulu, kalau tidak ada cari di mana saja (channel lama mungkin di kategori lain)
      let channel = guild.channels.cache.find((c) => c.parentId === category.id && wanted.includes(c.name.toLowerCase()))
        || guild.channels.cache.find((c) => c.type !== ChannelType.GuildCategory && wanted.includes(c.name.toLowerCase()));
      if (!channel) {
        channel = await guild.channels.create({
          name: ch.name,
          type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: ow,
        });
      } else {
        const want = (isVoice ? ch.name : norm(ch.name));
        if (channel.name.toLowerCase() !== want.toLowerCase()) await channel.setName(ch.name).catch(() => {});
        if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false }).catch(() => {});
        await channel.permissionOverwrites.set(ow);
      }
      if (ch.post && !isVoice) await postOnce(channel, POSTS[ch.post]);
    }
  }

  /* --- Susun urutan role (Big Papa paling atas, tepat di bawah role bot) --- */
  try {
    const botPos = guild.members.me.roles.highest.position;
    const list = ROLES.map((r) => R[r.key]);
    const base = botPos - 1;
    if (base - list.length < 0) {
      console.log('[!] Role bot terlalu rendah untuk menyusun urutan. Naikkan role bot ke paling atas lalu jalankan ulang.');
    } else {
      await guild.roles.setPositions(list.map((role, n) => ({ role, position: base - n })));
    }
  } catch (e) {
    console.log('[!] Gagal menyusun urutan role:', e.message);
  }

  /* --- Hapus semua role lama yang tidak ada di daftar baru --- */
  console.log('Menghapus role lama...');
  await guild.roles.fetch();
  const keep = new Set(ROLES.map((r) => r.name));
  for (const role of guild.roles.cache.values()) {
    if (role.id === EVERYONE || role.managed || keep.has(role.name)) continue;
    try {
      await role.delete('Setup Cartagena Family: role lama diganti');
      console.log('  dihapus:', role.name);
    } catch (e) {
      console.log(`  [!] Tidak bisa menghapus "${role.name}": ${e.message} (pindahkan role bot ke atas lalu jalankan ulang)`);
    }
  }

  console.log('Selesai! Role, kategori, channel, dan izin sudah diperbarui.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, async () => {
  try {
    await main(client);
  } catch (e) {
    console.error('Gagal:', e);
  } finally {
    await client.destroy();
    process.exit(0);
  }
});
client.login(TOKEN);
