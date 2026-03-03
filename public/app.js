const socket = io();

const phoneInput = document.getElementById('phoneNumber');
const pairCodeInput = document.getElementById('pairCode');
const roleSelect = document.getElementById('role');
const joinBtn = document.getElementById('joinBtn');
const statusPill = document.getElementById('status');
const distancePill = document.getElementById('distance');
const hint = document.getElementById('hint');

let watchId;
let currentRoom;
let myRole;
let latestState = { me: null, target: null };

const map = L.map('map').setView([20.5937, 78.9629], 5);

const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
});

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  }
);

street.addTo(map);
L.control.layers({ Streets: street, Satellite: satellite }).addTo(map);

const meMarker = L.marker([20.5937, 78.9629]).addTo(map).bindPopup('Me');
const targetMarker = L.marker([20.5937, 78.9629]).addTo(map).bindPopup('Phone Owner');

meMarker.setOpacity(0);
targetMarker.setOpacity(0);

joinBtn.addEventListener('click', () => {
  const phone = normalizeIndianPhone(phoneInput.value);
  const pairCode = pairCodeInput.value.trim();
  const role = roleSelect.value;

  if (!phone) {
    statusPill.textContent = 'Enter valid Indian phone number (+91XXXXXXXXXX or 10 digits)';
    return;
  }

  if (!/^\d{6}$/.test(pairCode)) {
    statusPill.textContent = 'Enter 6-digit pairing code';
    return;
  }

  currentRoom = `${phone}:${pairCode}`;
  myRole = role;

  socket.emit('join-room', { roomId: currentRoom, role });
  hint.textContent = 'Paired. Share same phone + code with the other person to receive accurate live GPS.';
  startTracking();
});

socket.on('room-joined', ({ roomId, role }) => {
  const [phone] = roomId.split(':');
  statusPill.textContent = `Connected for ${maskPhone(phone)} as ${role}`;
});

socket.on('state-update', (state) => {
  latestState = state;
  renderState();
});

function startTracking() {
  if (!navigator.geolocation) {
    statusPill.textContent = 'Geolocation not supported on this device/browser';
    return;
  }

  if (watchId) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      socket.emit('location-update', {
        roomId: currentRoom,
        role: myRole,
        coords,
        timestamp: Date.now(),
      });
    },
    (error) => {
      statusPill.textContent = `Location error: ${error.message}`;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000,
    }
  );
}

function renderState() {
  const me = latestState.me?.coords;
  const target = latestState.target?.coords;

  if (me) meMarker.setLatLng([me.lat, me.lng]).setOpacity(1);
  if (target) targetMarker.setLatLng([target.lat, target.lng]).setOpacity(1);

  if (me && target) {
    const distM = haversineMeters(me.lat, me.lng, target.lat, target.lng);
    distancePill.textContent = `Distance: ${formatDistance(distM)}`;

    const bounds = L.latLngBounds([
      [me.lat, me.lng],
      [target.lat, target.lng],
    ]);
    map.fitBounds(bounds.pad(0.35));
  }
}

function normalizeIndianPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (/^91\d{10}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  return null;
}

function maskPhone(phone) {
  return `+${phone.slice(0, 2)} ******${phone.slice(-4)}`;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}
