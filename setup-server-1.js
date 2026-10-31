// setup-server.js
// Membuat otomatis: role, kategori, channel, izin akses, dan pesan rules.
// Aman dijalankan ulang: yang sudah ada tidak dibuat dobel, izinnya cuma diperbarui.

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

/* ================= 1. ROLE (urut dari terendah ke tertinggi) ================= */
const ROLES = [
  { key: 'tamu', name: 'Tamu', color: 0x95a5a6 },
  { key: 'anggota', name: 'Anggota', color: 0x3498db, hoist: true },
  { key: 'bendahara', name: 'Bendahara', color: 0x2ecc71, hoist: true },
  {
    key: 'staff', name: 'Staff', color: 0xe67e22, hoist: true,
    perms: [P.KickMembers, P.ManageMessages, P.ModerateMembers, P.ManageNicknames, P.MoveMembers, P.MuteMembers],
  },
  {
    key: 'leader', name: 'Leader', color: 0xf1c40f, hoist: true,
    perms: [P.KickMembers, P.BanMembers, P.ManageMessages, P.ModerateMembers, P.ManageNicknames, P.MoveMembers, P.MuteMembers],
  },
];

/* ================= 2. STRUKTUR KATEGORI & CHANNEL =================
   view    : siapa yang bisa melihat ('everyone', 'tamu', 'anggota'). Staff & Leader selalu bisa.
   mode    : 'ro' = hanya baca, 'chat' = boleh kirim pesan
   writers : role tambahan yang boleh menulis di channel read-only
   voice   : true = voice channel
   post    : isi pesan otomatis (lihat POSTS)                                              */
const STRUCTURE = [
  {
    name: '❖ WELCOME ❖', view: ['everyone'], channels: [
      { name: '👋・welcome-goodbye' },
      { name: '📜・rules-server', post: 'rulesServer' },
      { name: '🎭・take-role' },
      { name: '🏴・tentang-komunitas', post: 'tentang' },
    ],
  },
  {
    name: '❖ PUBLIC ❖', view: ['tamu', 'anggota'], channels: [
      { name: '💬・chat-public', mode: 'chat' },
      { name: '📌・syarat-daftar', post: 'syarat' },
      { name: '📝・request-member', mode: 'chat' },
      { name: '✅・hasil-seleksi' },
      { name: '💡・saran-bug', mode: 'chat' },
    ],
  },
  {
    name: '❖ ANGGOTA ❖', view: ['anggota'], channels: [
      { name: '📢・announcement' },
      { name: '📜・rules-family', post: 'rulesFamily' },
      { name: '📘・guide-family' },
      { name: '👑・struktur-family' },
      { name: '🖼️・logo-family' },
      { name: '💬・chat-anggota', mode: 'chat' },
      { name: '🗓️・jadwal-absensi' },
      { name: '📩・izin-cuti', mode: 'chat' },
      { name: '📸・screenshot-rp', mode: 'chat' },
      { name: '🎬・video-jj-aktivitas', mode: 'chat' },
      { name: '📍・lokasi-hood', mode: 'chat' },
      { name: '🌿・lokasi-private-farm', mode: 'chat' },
    ],
  },
  {
    name: '❖ STORY FAMILY ❖', view: ['anggota'], channels: [
      { name: '📖・sejarah-family' },
      { name: '📜・storyline-rp' },
      { name: '🎯・rencana-ide-cerita', mode: 'chat' },
      { name: '🖼️・galeri-momen', mode: 'chat' },
    ],
  },
  {
    name: '❖ GUDANG ❖', view: ['anggota'], channels: [
      { name: '🔫・data-armory', writers: ['bendahara'] },
      { name: '💵・data-uang', writers: ['bendahara'] },
      { name: '💊・data-item', writers: ['bendahara'] },
      { name: '💰・donasi-gudang', mode: 'chat' },
    ],
  },
  {
    name: '❖ PELANGGARAN ❖', view: ['anggota'], channels: [
      { name: '⚠️・warn-anggota' },
      { name: '🚫・blacklist' },
      { name: '📩・klarifikasi', mode: 'chat' },
      { name: '🔊・voice-klarifikasi', voice: true },
    ],
  },
  {
    name: '❖ STAFF ❖', view: [], channels: [
      { name: '🗂️・data-karakter' },
      { name: '🛠️・chat-staff', mode: 'chat' },
      { name: '🧾・log-bot' },
    ],
  },
  {
    name: '❖ VOICE ❖', view: ['anggota'], channels: [
      { name: '🔊・lobby', voice: true },
      { name: '🏴・meeting family', voice: true },
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
      '**6.** Dilarang spam, iklan, dan menyebar link tanpa izin staff.',
      '**7.** Patuhi arahan staff.',
      '**8.** Pelanggaran dapat dikenai warn, kick, atau blacklist.',
    ].join('\n'),
  },
  rulesFamily: {
    title: '📜 PERATURAN FAMILY (contoh, silakan ubah)',
    desc: [
      '**1.** Hormati leader dan seluruh anggota family.',
      '**2.** Wajib aktif dan ikut meeting family mingguan.',
      '**3.** Tidak aktif? Wajib lapor di #izin-cuti.',
      '**4.** Dilarang menyebar data gudang dan rahasia family.',
      '**5.** Masalah pribadi tidak dibawa ke dalam family.',
      '**6.** 3 warn = kick dari family.',
    ].join('\n'),
  },
  syarat: {
    title: '📌 SYARAT & TATA CARA DAFTAR',
    desc: '*(Isi syarat dan tata cara pendaftaran di sini. Edit pesan ini atau hapus lalu tulis ulang.)*',
  },
  tentang: {
    title: '🏴 TENTANG KOMUNITAS',
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

function buildOverwrites(view, mode, writers, isVoice) {
  const ow = [];
  if (view.includes('everyone')) {
    ow.push({ id: EVERYONE, allow: READ, deny: WRITE_DENY });
  } else {
    ow.push({ id: EVERYONE, deny: [P.ViewChannel] });
  }
  for (const k of view) {
    if (k === 'everyone') continue;
    if (isVoice) ow.push({ id: R[k].id, allow: VOICE });
    else if (mode === 'chat') ow.push({ id: R[k].id, allow: [...READ, ...WRITE] });
    else ow.push({ id: R[k].id, allow: READ, deny: WRITE_DENY });
  }
  for (const k of writers) ow.push({ id: R[k].id, allow: [...READ, ...WRITE] });
  for (const k of ['staff', 'leader']) {
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

/* ================= 5. JALANKAN ================= */
async function main(client) {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.channels.fetch();
  EVERYONE = guild.roles.everyone.id;

  console.log('Membuat role...');
  for (const r of ROLES) {
    let role = guild.roles.cache.find((x) => x.name === r.name);
    if (!role) {
      role = await guild.roles.create({
        name: r.name, color: r.color, hoist: !!r.hoist, permissions: r.perms || [], reason: 'Setup server',
      });
    }
    R[r.key] = role;
  }

  for (const cat of STRUCTURE) {
    console.log('Kategori:', cat.name);
    const catOw = buildOverwrites(cat.view, 'ro', [], false);
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === cat.name,
    );
    if (!category) {
      category = await guild.channels.create({
        name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites: catOw,
      });
    } else {
      await category.permissionOverwrites.set(catOw);
    }

    for (const ch of cat.channels) {
      const isVoice = !!ch.voice;
      const ow = buildOverwrites(cat.view, ch.mode || 'ro', ch.writers || [], isVoice);
      // take-role harus terlihat semua orang; ikut kategori (everyone) jadi sudah terpenuhi
      const wanted = (isVoice ? ch.name : ch.name.toLowerCase().replace(/\s+/g, '-')).toLowerCase();
      let channel = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name.toLowerCase() === wanted,
      );
      if (!channel) {
        channel = await guild.channels.create({
          name: ch.name,
          type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: ow,
        });
      } else {
        await channel.permissionOverwrites.set(ow);
      }
      if (ch.post && !isVoice) await postOnce(channel, POSTS[ch.post]);
    }
  }
  console.log('Selesai! Semua kategori, channel, role, dan izin sudah dibuat.');
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
