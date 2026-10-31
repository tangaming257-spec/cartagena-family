// setup-server.js - CARTAGENA FAMILY (GTA SAMP RP)
//
// MODE AMAN (default): hanya membuat yang BELUM ADA (role, kategori, channel).
//   - Yang sudah ada TIDAK dibuat ulang, TIDAK di-rename, TIDAK diubah izinnya, TIDAK dihapus.
//   - Tidak mengirim pesan apa pun (rules, tentang komunitas, dll tidak disentuh).
//   - Pencocokan memakai nama inti (emoji, simbol, huruf besar/kecil diabaikan),
//     jadi channel yang sudah kamu ubah sedikit namanya tetap dikenali, bukan dibuat dobel.
//
// Perubahan lain HANYA terjadi kalau kamu yang memerintahkan lewat opsi:
//   node setup-server.js                     -> mode aman (buat yang belum ada saja)
//   node setup-server.js --izin-request      -> atur izin channel request-family saja (untuk tombol Daftar)
//   node setup-server.js --perbarui-izin     -> terapkan ulang izin semua kategori & channel
//   node setup-server.js --rapikan-nama      -> samakan nama kategori/channel & pindahkan ke kategori yang benar
//   node setup-server.js --rapikan-role      -> samakan nama/warna/izin role & urutannya
//   node setup-server.js --hapus-role-lama   -> hapus role yang tidak ada di daftar
//   node setup-server.js --kirim-pesan       -> kirim pesan awal (rules/tentang/syarat) ke channel yang MASIH KOSONG
// Opsi boleh digabung, misalnya: node setup-server.js --izin-request --perbarui-izin

const {
  Client, GatewayIntentBits, ChannelType, Events,
  PermissionFlagsBits: P, EmbedBuilder,
} = require('discord.js');

const ARGS = new Set(process.argv.slice(2));
const FLAG = {
  izin: ARGS.has('--perbarui-izin'),
  izinRequest: ARGS.has('--izin-request'),
  nama: ARGS.has('--rapikan-nama'),
  role: ARGS.has('--rapikan-role'),
  hapusRole: ARGS.has('--hapus-role-lama'),
  pesan: ARGS.has('--kirim-pesan'),
};

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !GUILD_ID) {
  console.error('Isi dulu TOKEN dan GUILD_ID. Contoh:\n  export TOKEN="isi_token"\n  export GUILD_ID="isi_id_server"');
  process.exit(1);
}

/* ================= 1. ROLE (urut dari TERTINGGI ke terendah) =================
   Nama role HARUS sama dengan yang ada di bot.js (ROLE_STYLE).
   old: nama lama role (di-rename, bukan dibuat ulang)
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
  { key: 'bigbrother', name: '🔱 Big Brother', old: ['🧔 Big Brother'], color: 0x3498db, hoist: true },
  { key: 'bigsister', name: '💎 Big Sister', old: ['👩 Big Sister'], color: 0xe84393, hoist: true },
  // RANK 4 - Anggota biasa
  { key: 'prince', name: '🌟 Prince', old: ['🤵 Prince', '⚔️ Prince', '🪙 Prince', '🦅 Prince'], color: 0x5dade2, hoist: true },
  { key: 'queen', name: '🌸 Queen', color: 0xf48fb1, hoist: true },
  // Tag
  { key: 'familycf', name: '🏠 Family CF', color: 0x7f8c8d },
  { key: 'verifiedcf', name: '✅ Verified CF', color: 0x1f8b4c },
  { key: 'anggotacf', name: '⚜️ Anggota Family Cartagena', color: 0xd4af37 }, // role hiasan
  { key: 'rpmakker', name: '🎮 RPMAKKER', color: 0x00bcd4 }, // role hiasan
  { key: 'tamu', name: '🎭 Tamu', color: 0x95a5a6 },
];

/* ================= 2. STRUKTUR KATEGORI & CHANNEL =================
   old     : nama lama (kategori/channel lama akan di-rename, bukan dibuat dobel)
   view    : 'everyone', 'tamu', 'family' (= role Family CF). Role pengurus selalu bisa.
   mode    : 'ro' = hanya baca, 'chat' = boleh kirim pesan,
             'thread' = tidak bisa mengetik di channel, hanya di thread pribadi (untuk tombol Daftar)
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
      { name: '📝・request-family', old: ['📝・request-member'], mode: 'thread' }, // panel + tombol Daftar, isi formulir di thread pribadi
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
let BOT_ROLE = null;
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
      else if (mode === 'thread') {
        ow.push({
          id: R[k].id,
          allow: [...READ, P.SendMessagesInThreads, P.AttachFiles, P.EmbedLinks],
          deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions],
        });
      } else ow.push({ id: R[k].id, allow: READ, deny: WRITE_DENY });
    }
  }
  if (mode === 'thread' && BOT_ROLE) { // bot harus bisa membuat thread pribadi di channel ini
    ow.push({
      id: BOT_ROLE.id,
      allow: [...READ, ...WRITE, P.CreatePrivateThreads, P.ManageThreads],
    });
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
  if (last.size > 0) return false; // sudah ada pesan (milikmu atau bot): jangan kirim apa pun
  const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.desc).setColor(0x2b2d31);
  await channel.send({ embeds: [embed] });
  return true;
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, '-');
// nama inti: emoji, simbol, spasi, dan huruf besar/kecil diabaikan ("🏠・tentang-komunitas" = "tentang komunitas")
const key = (s) => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ================= 5. JALANKAN ================= */
async function main(client) {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();
  EVERYONE = guild.roles.everyone.id;
  const me = await guild.members.fetchMe().catch(() => null);
  BOT_ROLE = me?.roles.botRole || null;

  const info = {
    mode: Object.entries(FLAG).filter(([, v]) => v).map(([k]) => k),
    dibuat: [], sudahAda: 0, izin: 0, rename: 0, pesan: 0,
  };
  console.log(info.mode.length ? `Opsi aktif: ${info.mode.join(', ')}` : 'Mode aman: hanya membuat yang belum ada.');

  /* --- Role --- */
  for (const r of ROLES) {
    // cari nama persis, lalu nama lama, lalu nama inti (supaya tidak pernah dibuat dobel)
    let role = guild.roles.cache.find((x) => x.name === r.name)
      || guild.roles.cache.find((x) => (r.old || []).includes(x.name))
      || guild.roles.cache.find((x) => !x.managed && key(x.name) === key(r.name));
    if (!role) {
      role = await guild.roles.create({
        name: r.name, color: r.color, hoist: !!r.hoist, permissions: r.perms || [], reason: 'Setup Cartagena Family',
      });
      info.dibuat.push(`role ${r.name}`);
    } else {
      info.sudahAda++;
      if (FLAG.role) await role.edit({ name: r.name, color: r.color, hoist: !!r.hoist, permissions: r.perms || [] }).catch(() => {});
    }
    R[r.key] = role;
  }

  /* --- Kategori & channel --- */
  for (const cat of STRUCTURE) {
    const catOw = buildOverwrites(cat.view, 'ro', [], false);
    const catKeys = [cat.name, ...(cat.old || [])].map(key);
    let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && catKeys.includes(key(c.name)));
    if (!category) {
      category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites: catOw });
      info.dibuat.push(`kategori ${cat.name}`);
    } else {
      info.sudahAda++;
      if (FLAG.nama && category.name !== cat.name) { await category.setName(cat.name).catch(() => {}); info.rename++; }
      if (FLAG.izin) { await category.permissionOverwrites.set(catOw); info.izin++; }
    }

    for (const ch of cat.channels) {
      const isVoice = !!ch.voice;
      const ow = buildOverwrites(cat.view, ch.mode || 'ro', ch.writers || [], isVoice);
      const wanted = [ch.name, ...(ch.old || [])].map(key);
      const sameKind = (c) => c.type !== ChannelType.GuildCategory && !c.isThread() && c.isVoiceBased() === isVoice;
      // cari di kategori ini dulu, kalau tidak ada cari di mana saja
      let channel = guild.channels.cache.find((c) => sameKind(c) && c.parentId === category.id && wanted.includes(key(c.name)))
        || guild.channels.cache.find((c) => sameKind(c) && wanted.includes(key(c.name)));

      if (!channel) {
        channel = await guild.channels.create({
          name: ch.name, type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id, permissionOverwrites: ow,
        });
        info.dibuat.push(`channel ${ch.name}`);
      } else {
        info.sudahAda++;
        if (FLAG.nama) {
          const want = isVoice ? ch.name : norm(ch.name);
          if (channel.name.toLowerCase() !== want.toLowerCase()) { await channel.setName(ch.name).catch(() => {}); info.rename++; }
          if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false }).catch(() => {});
        }
        if (FLAG.izin || (FLAG.izinRequest && ch.mode === 'thread')) {
          await channel.permissionOverwrites.set(ow);
          info.izin++;
        }
      }

      // Pesan awal: HANYA kalau kamu memerintahkan (--kirim-pesan) dan channel masih kosong
      if (FLAG.pesan && ch.post && !isVoice) {
        const sent = await postOnce(channel, POSTS[ch.post]);
        if (sent) info.pesan++;
      }
    }
  }

  /* --- Urutan role (hanya dengan --rapikan-role) --- */
  if (FLAG.role) {
    try {
      const botPos = guild.members.me.roles.highest.position;
      const list = ROLES.map((r) => R[r.key]);
      const base = botPos - 1;
      if (base - list.length < 0) console.log('[!] Role bot terlalu rendah untuk menyusun urutan. Naikkan role bot ke paling atas lalu jalankan ulang.');
      else await guild.roles.setPositions(list.map((role, n) => ({ role, position: base - n })));
    } catch (e) {
      console.log('[!] Gagal menyusun urutan role:', e.message);
    }
  }

  /* --- Hapus role lama (hanya dengan --hapus-role-lama) --- */
  if (FLAG.hapusRole) {
    console.log('Menghapus role lama...');
    await guild.roles.fetch();
    const keep = new Set(ROLES.map((r) => r.name));
    for (const role of guild.roles.cache.values()) {
      if (role.id === EVERYONE || role.managed || keep.has(role.name)) continue;
      try {
        await role.delete('Setup Cartagena Family: role lama diganti');
        console.log('  dihapus:', role.name);
      } catch (e) {
        console.log(`  [!] Tidak bisa menghapus "${role.name}": ${e.message}`);
      }
    }
  }

  console.log('\n===== RINGKASAN =====');
  console.log(`Sudah ada (tidak disentuh): ${info.sudahAda}`);
  console.log(`Dibuat baru: ${info.dibuat.length}${info.dibuat.length ? '\n  - ' + info.dibuat.join('\n  - ') : ''}`);
  if (info.izin) console.log(`Izin diperbarui: ${info.izin}`);
  if (info.rename) console.log(`Nama dirapikan: ${info.rename}`);
  if (info.pesan) console.log(`Pesan awal dikirim: ${info.pesan}`);
  console.log('Selesai.');
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
