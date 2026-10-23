let map;
let markers = [];
let infoWindow;
let placesService;
let currentGenreFilter = 'all';

// JIS規格 全国47都道府県コード順リスト（01北海道〜47沖縄県）
const PREFECTURE_ORDER = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

// 稼働中店舗を最優先（JIS順）、休業中・閉業中を一番最後に配置するソート関数
function sortStores(data) {
  return [...data].sort((a, b) => {
    // 状態優先度: 通常営業中(0) < 休業中(1) < 閉業(2)
    const getStatusPriority = (item) => {
      if (item.status === 'closed') return 2;
      if (item.status === 'temporary_closed') return 1;
      return 0;
    };
    
    const prioA = getStatusPriority(a);
    const prioB = getStatusPriority(b);
    if (prioA !== prioB) {
      return prioA - prioB;
    }

    // 同グループ内はJIS規格コード順（北から南）
    const indexA = PREFECTURE_ORDER.indexOf(a.pref);
    const indexB = PREFECTURE_ORDER.indexOf(b.pref);
    const posA = indexA === -1 ? 999 : indexA;
    const posB = indexB === -1 ? 999 : indexB;
    if (posA !== posB) {
      return posA - posB;
    }
    return a.name.localeCompare(b.name, 'ja');
  });
}

// 各ジャンルの実稼働店舗数を集計してチップの数字を更新する関数
function updateChipCounts() {
  const isOpen = (item) => !item.status || item.status === 'open';

  const countAll = signStoresData.filter(isOpen).length;
  const countCafe = signStoresData.filter(item => 
    isOpen(item) && (item.genre === '手話カフェ・喫茶' || item.genre === '手話カフェ・飲食店')
  ).length;
  const countBar = signStoresData.filter(item => 
    isOpen(item) && item.genre === '手話バー・居酒屋'
  ).length;
  const countOther = signStoresData.filter(item => 
    isOpen(item) && item.genre !== '手話カフェ・喫茶' && item.genre !== '手話カフェ・飲食店' && item.genre !== '手話バー・居酒屋'
  ).length;

  const chipAll = document.querySelector('.genre-chip[data-genre="all"] .chip-count');
  const chipCafe = document.querySelector('.genre-chip[data-genre="cafe"] .chip-count');
  const chipBar = document.querySelector('.genre-chip[data-genre="bar"] .chip-count');
  const chipOther = document.querySelector('.genre-chip[data-genre="other"] .chip-count');
  const totalTag = document.getElementById('totalCountTag');

  if (chipAll) chipAll.textContent = countAll;
  if (chipCafe) chipCafe.textContent = countCafe;
  if (chipBar) chipBar.textContent = countBar;
  if (chipOther) chipOther.textContent = countOther;
  if (totalTag) totalTag.textContent = `${countAll}店舗 稼働中`;
}

// 地図の初期化
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 36.5, lng: 138.0 },
    zoom: 6,
    mapTypeId: 'roadmap',
    mapTypeControl: false,
    streetViewControl: false
  });
  infoWindow = new google.maps.InfoWindow();

  if (google.maps.places && google.maps.places.PlacesService) {
    placesService = new google.maps.places.PlacesService(map);
  }

  // チップ件数を実稼働数で初期化
  updateChipCounts();

  // 初期データ（稼働中優先ソート）を表示
  const sortedData = sortStores(signStoresData);
  renderData(sortedData);
  fitMapToBounds(sortedData);

  // 4分類ジャンルチップの初期化
  setupGenreChips();

  // バックグラウンドでGoogle Places APIによる動的検知
  checkPlacesBusinessStatus(sortedData);
}

const listContainer = document.getElementById('listContainer');
const storeCount = document.getElementById('storeCount');

// ジャンルに応じたバッジCSSクラス
function getBadgeClass(genre) {
  if (genre === '手話カフェ・喫茶' || genre === '手話カフェ・飲食店') {
    return 'badge-cafe';
  } else if (genre === '手話バー・居酒屋') {
    return 'badge-bar';
  } else {
    return 'badge-other';
  }
}

// ピンアイコンの選定（閉業はグレーピン、それ以外はジャンル色）
function getPinIcon(item) {
  if (item.status === 'closed') {
    return {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
      fillColor: '#9CA3AF',
      fillOpacity: 0.9,
      strokeColor: '#4B5563',
      strokeWeight: 1.5,
      scale: 1.4,
      anchor: new google.maps.Point(12, 22)
    };
  }

  const genre = item.genre;
  if (genre === '手話カフェ・喫茶' || genre === '手話カフェ・飲食店') {
    return 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  } else if (genre === '手話バー・居酒屋') {
    return 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png';
  } else {
    return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
  }
}

// データを画面（カード一覧 ＆ 地図ピン）に表示する関数
function renderData(data) {
  const openCount = data.filter(item => !item.status || item.status === 'open').length;
  const closedOrTempCount = data.length - openCount;

  if (storeCount) {
    if (closedOrTempCount > 0) {
      storeCount.textContent = `稼働中 ${openCount}件 (休・閉業 ${closedOrTempCount}件)`;
    } else {
      storeCount.textContent = `稼働中 ${openCount}件`;
    }
  }

  listContainer.innerHTML = '';
  
  markers.forEach(marker => marker.setMap(null));
  markers = [];

  if (data.length === 0) {
    listContainer.innerHTML = '<p style="padding: 2rem 1rem; text-align: center; color: var(--text-sub); font-size: 0.9rem;">該当する店舗・スポットが見つかりませんでした。</p>';
    return;
  }

  let dividerInserted = false;

  data.forEach((item, index) => {
    const isClosed = item.status === 'closed';
    const isTempClosed = item.status === 'temporary_closed';

    // 稼働中店舗が終わり、休業・閉業店舗が始まる箇所にセクション区切りを挿入
    if ((isClosed || isTempClosed) && !dividerInserted) {
      const divider = document.createElement('div');
      divider.className = 'list-section-divider';
      divider.textContent = '休業・閉業している店舗';
      listContainer.appendChild(divider);
      dividerInserted = true;
    }

    // 1. リストカードの作成
    const card = document.createElement('div');
    const statusClass = isClosed ? 'is-closed' : (isTempClosed ? 'is-temp-closed' : '');
    card.className = `facility-card ${statusClass}`;
    card.id = `store-card-${index}`;
    const badgeClass = getBadgeClass(item.genre);

    // ステータスバッジ
    let statusBadgeHtml = '';
    if (isClosed) {
      statusBadgeHtml = '<span class="badge-closed">🛑 閉業</span>';
    } else if (isTempClosed) {
      statusBadgeHtml = '<span class="badge-temp-closed">⚠️ 休業中</span>';
    }

    // 閉業・休業アラート注記
    let alertBoxHtml = '';
    if (isClosed) {
      alertBoxHtml = `<div class="status-alert-box alert-closed">${item.statusNote || '🛑 こちらの店舗は現在閉業しています'}</div>`;
    } else if (isTempClosed) {
      alertBoxHtml = `<div class="status-alert-box alert-temp-closed">${item.statusNote || '⚠️ 現在休業中です（最新情報は公式情報をご確認ください）'}</div>`;
    }

    // リンクHTML（閉業・休業店舗は完全非表示）
    let linkHtml = '';
    if (!isClosed && !isTempClosed && item.url) {
      linkHtml = `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="site-link">🔗 公式サイト・SNSを見る ↗</a>`;
    }

    card.innerHTML = `
      <div class="facility-card-content">
        <div class="card-top-row">
          <div class="card-tags-left">
            <span class="badge ${badgeClass}">${item.genre}</span>
            <span class="pref-tag">📍 ${item.pref}</span>
          </div>
          ${statusBadgeHtml}
        </div>
        <h3>${item.name}</h3>
        ${alertBoxHtml}
        <p>${item.address}</p>
        <div class="features-box">
          💬 <strong>特徴:</strong> ${item.features}
        </div>
        <p style="margin-top: 4px;">⏰ <strong>営業時間:</strong><br><span style="font-size:0.85em; color:var(--text-sub); display:inline-block; margin-top:2px;">${item.hours || '公式情報をご確認ください'}</span></p>
        ${linkHtml}
      </div>
    `;

    // 2. マップにピンを立てる
    const pinIcon = getPinIcon(item);
    const marker = new google.maps.Marker({
      position: { lat: item.lat, lng: item.lng },
      map: map,
      title: `${item.name} (${item.pref})${isClosed ? ' 【閉業】' : (isTempClosed ? ' 【休業中】' : '')}`,
      icon: pinIcon
    });
    
    // ピンのクリックイベント（ポップアップ）
    marker.addListener('click', () => {
      let popupStatusHtml = '';
      if (isClosed) {
        popupStatusHtml = `<div style="background:#FEF2F2; color:#991B1B; padding:3px 6px; font-weight:bold; font-size:0.75rem; border-radius:4px; margin-bottom:5px; border:1px solid #FECACA;">${item.statusNote || '🛑 こちらの店舗は現在閉業しています'}</div>`;
      } else if (isTempClosed) {
        popupStatusHtml = `<div style="background:#FFF7ED; color:#9A3412; padding:3px 6px; font-weight:bold; font-size:0.75rem; border-radius:4px; margin-bottom:5px; border:1px solid #FED7AA;">${item.statusNote || '⚠️ 現在休業中です'}</div>`;
      }

      let popupLinkHtml = '';
      if (!isClosed && !isTempClosed && item.url) {
        popupLinkHtml = `<a href="${item.url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; font-size: 0.8rem; color: #ea5504; font-weight: bold; text-decoration: none;">🔗 公式SNS・詳細を見る ↗</a>`;
      }

      infoWindow.setContent(`
        <div style="max-width: 260px; font-family: sans-serif; line-height: 1.45;">
          <div style="display: flex; gap: 4px; margin-bottom: 4px; align-items: center;">
            <span style="font-size: 0.7rem; font-weight: bold; color: #ea5504; background: #FFF2EC; padding: 2px 6px; border-radius: 4px;">${item.genre}</span>
            <span style="font-size: 0.7rem; font-weight: bold; color: #6B6355; background: #F5F3E9; padding: 2px 6px; border-radius: 4px;">${item.pref}</span>
          </div>
          <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: ${isClosed ? '#6B7280; text-decoration: line-through;' : '#251F0F;'}">${item.name}</h4>
          ${popupStatusHtml}
          <p style="margin: 0 0 4px 0; font-size: 0.8rem; color: #6B6355;">📍 ${item.address}</p>
          <div style="background: ${isClosed ? '#E5E7EB' : '#FFF7F2'}; border: 1px dashed ${isClosed ? '#9CA3AF' : '#ea5504'}; border-radius: 4px; padding: 4px 6px; font-size: 0.75rem; color: ${isClosed ? '#4B5563' : '#9c3600'}; margin-bottom: 6px;">
            💬 <strong>特徴:</strong> ${item.features}
          </div>
          <p style="margin: 0 0 6px 0; font-size: 0.78rem; color: #6B6355;">⏰ <strong>営業時間:</strong><br>${item.hours}</p>
          ${popupLinkHtml}
        </div>
      `);
      infoWindow.open(map, marker);
    });

    markers.push(marker);

    // カードクリックで地図フォーカス＆吹き出し表示
    card.addEventListener('click', () => {
      map.setZoom(15);
      map.setCenter(marker.getPosition());
      new google.maps.event.trigger(marker, 'click');
    });

    listContainer.appendChild(card);
  });
}

// Google Places APIによる営業状況の動的チェック
function checkPlacesBusinessStatus(data) {
  if (!placesService) return;

  data.forEach((item, idx) => {
    if (item.status === 'closed' || item.status === 'temporary_closed') return;

    setTimeout(() => {
      const request = {
        query: `${item.name} ${item.address}`,
        fields: ['name', 'business_status', 'geometry']
      };

      placesService.findPlaceFromQuery(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
          const place = results[0];
          if (place.business_status === 'CLOSED_PERMANENTLY') {
            console.warn(`[Places API検知] 閉業が確認されました: ${item.name}`);
            item.status = 'closed';
            item.statusNote = '🛑 Googleマップ上で「閉業」が報告されています';
            item.url = '';
            updateChipCounts();
            filterByGenre(currentGenreFilter);
          } else if (place.business_status === 'CLOSED_TEMPORARILY') {
            console.warn(`[Places API検知] 一時休業が確認されました: ${item.name}`);
            item.status = 'temporary_closed';
            item.statusNote = '⚠️ Googleマップ上で「一時休業」が報告されています';
            item.url = '';
            updateChipCounts();
            filterByGenre(currentGenreFilter);
          }
        }
      });
    }, idx * 600);
  });
}

// 地図の表示範囲をピン群に合わせて自動調整
function fitMapToBounds(data) {
  if (!map || data.length === 0) return;
  const bounds = new google.maps.LatLngBounds();
  data.forEach(item => {
    bounds.extend(new google.maps.LatLng(item.lat, item.lng));
  });
  map.fitBounds(bounds);

  const zoomListener = google.maps.event.addListener(map, 'idle', () => {
    if (map.getZoom() > 14) {
      map.setZoom(14);
    }
    google.maps.event.removeListener(zoomListener);
  });
}

// 4分類ジャンルチップの絞り込み処理
function setupGenreChips() {
  const chips = document.querySelectorAll('.genre-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const genreKey = chip.getAttribute('data-genre');
      currentGenreFilter = genreKey;

      filterByGenre(genreKey);
    });
  });
}

function filterByGenre(genreKey) {
  let filtered = signStoresData;

  if (genreKey === 'cafe') {
    filtered = signStoresData.filter(item => 
      item.genre === '手話カフェ・喫茶' || item.genre === '手話カフェ・飲食店'
    );
  } else if (genreKey === 'bar') {
    filtered = signStoresData.filter(item => item.genre === '手話バー・居酒屋');
  } else if (genreKey === 'other') {
    filtered = signStoresData.filter(item => 
      item.genre !== '手話カフェ・喫茶' && 
      item.genre !== '手話カフェ・飲食店' && 
      item.genre !== '手話バー・居酒屋'
    );
  }

  // 稼働中優先 ＋ 休業・閉業末尾ソート
  const sorted = sortStores(filtered);
  renderData(sorted);
  fitMapToBounds(sorted);
}

// 画面読み込み時に初期化
window.onload = () => {
  initMap();
};
