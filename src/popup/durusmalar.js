/**
 * durusmalar.js — the hearing table, as a page of its own.
 *
 * The panel has room for a list; a table with every column, grouped by day,
 * printable and exportable needs a full page. It reads the list the panel last
 * fetched (chrome.storage.local, `durusmaListesi`) and never asks UYAP itself.
 */

import { gunAdi, saatMetni, tarihMetni } from '../lib/durusma.js';
import { excelDizini } from '../lib/excel.js';

const $ = (s) => document.querySelector(s);

const SUTUNLAR = [
  { baslik: 'No', genislik: 5, alan: 'no', tur: 'sayi' },
  { baslik: 'Tarih', genislik: 11, alan: 'tarih', tur: 'tarih' },
  { baslik: 'Gün', genislik: 11, alan: 'gun' },
  { baslik: 'Saat', genislik: 7, alan: 'saat' },
  { baslik: 'Birim', genislik: 38, alan: 'birim' },
  { baslik: 'Dosya No', genislik: 14, alan: 'dosyaNo' },
  { baslik: 'Dosya Türü', genislik: 20, alan: 'dosyaTuru' },
  { baslik: 'İşlem', genislik: 16, alan: 'islem' },
  { baslik: 'Müvekkil', genislik: 30, alan: 'muvekkil' },
  { baslik: 'Diğer Taraflar', genislik: 40, alan: 'diger' },
  { baslik: 'Sonuç', genislik: 18, alan: 'sonuc' }
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function satirlar(kayitlar) {
  return kayitlar.map((k, i) => {
    const d = new Date(k.zaman);
    return {
      no: i + 1,
      tarih: iso(d),
      tarihMetni: tarihMetni(d),
      gun: gunAdi(d),
      saat: saatMetni(d),
      birim: k.birim,
      dosyaNo: k.dosyaNo,
      dosyaTuru: k.dosyaTuru,
      islem: k.islem,
      muvekkil: k.vekiliOlunan.join(', '),
      diger: k.digerTaraflar.join(', '),
      sonuc: k.sonuc
    };
  });
}

function hucre(tr, metin, sinif) {
  const td = document.createElement('td');
  if (sinif) td.className = sinif;
  td.textContent = metin || '';
  tr.appendChild(td);
  return td;
}

async function goster() {
  const { durusmaListesi: v } = await chrome.storage.local.get('durusmaListesi');
  if (!v?.kayitlar) {
    $('#bos').hidden = false;
    $('#bos').textContent =
      "Henüz duruşma sorgulanmadı. UYAP Avukat Portal'a girin; panelin Duruşmalar bölümü listeyi kendiliğinden alır.";
    $('#excel').disabled = true;
    return;
  }

  const sorgu = new Date(v.zaman);
  $('#baslik').textContent = `Duruşmalar · ${v.aralik.baslangicTarihi} – ${v.aralik.bitisTarihi}`;
  $('#alt').textContent =
    `${v.kayitlar.length} duruşma · UYAP'tan alındığı an: ${tarihMetni(sorgu)} ${saatMetni(sorgu)}`;
  document.title = `${$('#baslik').textContent} — UYAP Dosyalama ve Evrak Asistanı`;

  if (!v.kayitlar.length) {
    $('#bos').hidden = false;
    $('#bos').textContent = 'Bu aralıkta duruşmanız görünmüyor.';
    return;
  }

  const govde = $('#tablo tbody');
  const bugun = tarihMetni(new Date());
  let sonGun = '';
  for (const s of satirlar(v.kayitlar)) {
    if (s.tarihMetni !== sonGun) {
      sonGun = s.tarihMetni;
      const tr = document.createElement('tr');
      tr.className = 'gun';
      const td = hucre(tr, `${s.tarihMetni} ${s.gun}${s.tarihMetni === bugun ? ' · bugün' : ''}`);
      td.colSpan = 9;
      govde.appendChild(tr);
    }
    const tr = document.createElement('tr');
    if (s.tarihMetni === bugun) tr.className = 'bugun';
    hucre(tr, String(s.no), 'no');
    hucre(tr, s.tarihMetni, 'tarih');
    hucre(tr, s.saat, 'saat');
    hucre(tr, s.birim);
    hucre(tr, s.dosyaNo);
    hucre(tr, s.dosyaTuru, 'soluk');
    const islem = hucre(tr, s.islem);
    if (s.sonuc) {
      const alt = document.createElement('div');
      alt.className = 'soluk';
      alt.textContent = s.sonuc;
      islem.appendChild(alt);
    }
    hucre(tr, s.muvekkil);
    hucre(tr, s.diger, 'soluk');
    govde.appendChild(tr);
  }
  $('#tablo').hidden = false;

  $('#excel').onclick = () => {
    const blob = excelDizini({
      baslik: $('#baslik').textContent,
      altBaslik: $('#alt').textContent + ' · UYAP Dosyalama ve Evrak Asistanı',
      satirlar: satirlar(v.kayitlar),
      sutunlar: SUTUNLAR,
      sayfaAdi: 'Duruşmalar'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Duruşmalar ${v.aralik.baslangicTarihi}-${v.aralik.bitisTarihi}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  };
}

$('#yazdir').addEventListener('click', () => window.print());
goster();
