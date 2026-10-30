/* =====================================================================
   DJJS IT Asset Management — shared core (used by both server and client)
   Categories, specifications, profiles, relationship helpers.
   Helpers read the active dataset from DB; call setDB(db) before using them.
   ===================================================================== */
export let DB = null;
export function setDB(d) { DB = d; }
export const VER = 3;
export const pad = n => String(n).padStart(2, '0');
export const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => iso(new Date());
export const dd = n => { const x = new Date(); x.setDate(x.getDate() + n); return iso(x); };
export const daysTo = d => d ? Math.round((new Date(String(d).slice(0, 10) + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null;
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtD = d => { if (!d) return ''; const p = String(d).slice(0, 10).split('-'); if (p.length < 3 || !MON[+p[1] - 1]) return String(d); return `${p[2]}-${MON[+p[1] - 1]}-${p[0]}`; };
export const fmtDT = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const money = v => (v === '' || v == null || isNaN(v)) ? '' : '₹ ' + Number(v).toLocaleString('en-IN');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const uniq = a => [...new Set(a.filter(x => x !== '' && x != null))];
export const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(String(i)); return r; };
export const num = v => (v === '' || v == null || isNaN(v)) ? 0 : Number(v);
export const clone = o => JSON.parse(JSON.stringify(o));
/* ---------------- Masters (editable in Settings) ---------------- */
export const DEFAULT_MASTERS = {
  departments: ['IT', 'Administration', 'Accounts', 'Media', 'Publication', 'Security', 'Kitchen', 'Reception', 'Education', 'Health'],
  designations: ['IT Head', 'Network Engineer', 'System Administrator', 'CCTV Technician', 'Hardware Technician', 'IT Sewadar', 'Office Staff', 'Coordinator'],
  conditions: ['New', 'Good', 'Fair', 'Poor', 'Damaged', 'Not Working'],
  priorities: ['Low', 'Normal', 'High', 'Critical'],
  purposes: ['Event / Programme Duty', 'Training', 'Field Work', 'Standby (while own asset in repair)', 'Visiting Staff / Sewadar', 'Meeting / Presentation', 'Other'],
  borrowerTypes: ['Employee', 'Sewadar', 'Team / Department', 'External Party'],
  locationTypes: ['Centre / Branch', 'Building', 'Floor', 'Room', 'Data Centre / Server Room', 'Rack / Cabinet', 'Installation Point', 'Outdoor Pole / Junction'],
  licenceTypes: ['Perpetual', 'Subscription', 'Volume', 'OEM', 'Open Source', 'Per Device', 'Per User'],
  contractTypes: ['Comprehensive AMC', 'Non-Comprehensive AMC', 'Support Contract', 'Service Level Agreement', 'Rental / Lease', 'Internet / Connectivity'],
  renewalStatuses: ['Not Started', 'Renewal Requested', 'Awaiting Approval', 'In Progress', 'Renewed', 'Not Required', 'Overdue'],
  carriers: ['By Hand', 'Vendor Pickup', 'Courier', 'Staff Vehicle'],
  serviceCategories: ['Hardware Repair', 'Networking', 'Fibre / OFC', 'CCTV', 'Data Centre', 'Electrical / UPS', 'Software', 'Printers', 'AMC Provider', 'Supplier'],
  linkTypes: ['Copper (UTP)', 'Optical Fibre', 'Uplink / Trunk', 'CCTV Camera → NVR', 'Wireless Bridge', 'Power (UPS → Device)'],
  partTypes: ['RAM', 'SSD / HDD', 'Surveillance HDD', 'Battery', 'Adapter / Charger', 'Power Supply (SMPS)', 'Keyboard', 'Screen / Display', 'Motherboard', 'Fan', 'Fuser / Drum', 'Toner / Cartridge', 'Camera Lens / Housing', 'SFP Module', 'Patch Cord', 'Fibre Splice', 'Cable / Connector', 'Other'],
  visitTypes: ['Preventive (Scheduled)', 'Breakdown Call', 'Emergency', 'Inspection / Audit', 'Installation Support'],
  reminderDays: ['90', '60', '30', '15', '7'],
  staff: [], technicians: [], persons: [],
  manufacturers: ['APC', 'Canon', 'Cisco', 'CommScope', 'CP Plus', 'D-Link', 'Dahua', 'Dell', 'Epson', 'Finolex', 'Fortinet', 'Hikvision', 'HP', 'Lenovo', 'Molex', 'Motorola', 'Netrack', 'Numeric', 'Seagate', 'Sophos', 'Sterlite', 'TP-Link', 'Ubiquiti', 'Valrack', 'Vertiv', 'WD'],
};
export const COMBO_LABEL = { staff: 'IT Staff', technicians: 'Technicians / Vendor Engineers', persons: 'Persons', manufacturers: 'Manufacturers / Brands', designations: 'Designations' };

export const ASSET_STATUSES = ['In Stock', 'Installed / In Use', 'Assigned', 'Temporarily Assigned', 'Reserved', 'In Transit', 'Standby / Spare', 'In Repair (In-House)', 'Sent for Repair', 'Under Maintenance', 'Faulty', 'Retired', 'Lost', 'Stolen', 'Disposed'];
export const SYS_STATUSES = ['Assigned', 'Temporarily Assigned', 'In Repair (In-House)', 'Sent for Repair', 'Under Maintenance'];
export const CAN_TEMP = ['In Stock', 'Standby / Spare', 'Assigned'];
export const CAN_ASSIGN = ['In Stock', 'Standby / Spare'];
export const GONE = ['Retired', 'Lost', 'Stolen', 'Disposed'];
export const live = a => a && !GONE.includes(a.status);

/* ---------------- Hardware categories ---------------- */
export const DEFAULT_CAT_GROUPS = {
  'Network & Rack': ['Rack', 'Patch Panel', 'Cable Manager', 'Switch', 'PoE Switch', 'Router', 'Firewall', 'Access Point', 'Wireless Controller', 'Modem / ONT'],
  'Fibre & OFC': ['OFC Cable', 'LIU / ODF', 'Fibre Joint Closure', 'Fibre Patch Cord', 'Pigtail', 'SFP Module', 'Media Converter'],
  'Data Centre': ['Server', 'Storage / NAS', 'Rack PDU', 'KVM Switch', 'Precision AC', 'Environment Sensor', 'Fire Suppression'],
  'CCTV (IP)': ['NVR', 'IP Camera', 'PTZ Camera', 'Surveillance HDD', 'PoE Injector', 'CCTV Monitor', 'Video Wall', 'CCTV Joystick / Keyboard'],
  'Computing (End User)': ['Desktop', 'Laptop', 'All-in-One', 'Thin Client', 'Tablet'],
  'Display & Peripherals': ['Monitor', 'Keyboard / Mouse', 'Webcam', 'Headset', 'External HDD'],
  'Printing & Scanning': ['Printer', 'Multifunction Printer', 'Scanner', 'Label / Barcode Printer'],
  'Power': ['UPS', 'UPS Battery Bank', 'Inverter', 'Battery', 'Stabilizer'],
  'Communication': ['Walkie-Talkie', 'Walkie-Talkie Charger', 'IP Phone', 'EPABX', 'Mobile Phone', 'Biometric Device'],
  'AV & Event': ['Projector', 'TV / Display', 'LED Screen', 'Speaker / Amplifier', 'Microphone', 'Video Conferencing Unit'],
  'Other': ['Other'],
};
export const OLD_CAT_MAP = { 'NVR/DVR': 'NVR', 'DVR': 'NVR', 'CCTV Camera': 'IP Camera', 'Analog Camera': 'IP Camera', 'Storage': 'Storage / NAS', 'Peripheral': 'Keyboard / Mouse', 'PDU': 'Rack PDU', 'Camera Power Supply': 'PoE Injector' };
export const SWITCH_CATS = ['Switch', 'PoE Switch', 'Router', 'Firewall'];
export const CAMERA_CATS = ['IP Camera', 'PTZ Camera'];
export const PORT_CATS = ['Switch', 'PoE Switch', 'Router', 'Firewall', 'Patch Panel', 'LIU / ODF', 'KVM Switch'];

/* Which standard fields each kind of item uses (overridable per category in Settings) */
export const STD = ['manufacturer', 'model', 'serialNumber', 'ipAddress', 'macAddress', 'connSwitch', 'connPort', 'jackId', 'purchaseId', 'vendorId', 'purchaseDate', 'purchaseCost', 'warrantyEnd', 'amcId'];
export const STD_LABEL = { manufacturer: 'Manufacturer / Brand', model: 'Model', serialNumber: 'Serial Number', ipAddress: 'IP Address', macAddress: 'MAC Address', connSwitch: 'Connected Switch', connPort: 'Switch Port', jackId: 'Network Point / Jack ID', purchaseId: 'Purchase Order', vendorId: 'Supplier', purchaseDate: 'Purchase Date', purchaseCost: 'Purchase Cost', warrantyEnd: 'Warranty End', amcId: 'Covered by AMC' };
export const BUY = ['purchaseId', 'vendorId', 'purchaseDate', 'purchaseCost'];
export const KINDS = {
  passive: { show: [...BUY], req: [] },
  cable: { show: ['manufacturer', ...BUY], req: [] },
  netActive: { show: STD.filter(k => k !== 'jackId'), req: ['manufacturer', 'model', 'serialNumber', 'ipAddress'] },
  camera: { show: STD.filter(k => k !== 'jackId'), req: ['manufacturer', 'model', 'serialNumber', 'ipAddress', 'macAddress'] },
  endUser: { show: [...STD], req: ['manufacturer', 'model', 'serialNumber'] },
  netDevice: { show: [...STD], req: ['manufacturer', 'serialNumber'] },
  device: { show: ['manufacturer', 'model', 'serialNumber', ...BUY, 'warrantyEnd', 'amcId'], req: ['manufacturer', 'serialNumber'] },
  accessory: { show: ['manufacturer', 'model', 'serialNumber', ...BUY, 'warrantyEnd'], req: [] },
};
export const CAT_KIND = {
  'Rack': 'passive', 'Patch Panel': 'passive', 'Cable Manager': 'passive', 'LIU / ODF': 'passive', 'Fibre Joint Closure': 'passive', 'UPS Battery Bank': 'passive',
  'OFC Cable': 'cable', 'Fibre Patch Cord': 'cable', 'Pigtail': 'cable',
  'Switch': 'netActive', 'PoE Switch': 'netActive', 'Router': 'netActive', 'Firewall': 'netActive', 'Wireless Controller': 'netActive', 'Server': 'netActive', 'Storage / NAS': 'netActive', 'NVR': 'netActive',
  'IP Camera': 'camera', 'PTZ Camera': 'camera',
  'Desktop': 'endUser', 'Laptop': 'endUser', 'All-in-One': 'endUser', 'Thin Client': 'endUser',
  'Access Point': 'netDevice', 'Modem / ONT': 'netDevice', 'Printer': 'netDevice', 'Multifunction Printer': 'netDevice', 'IP Phone': 'netDevice', 'EPABX': 'netDevice', 'Biometric Device': 'netDevice', 'Environment Sensor': 'netDevice', 'Video Conferencing Unit': 'netDevice',
  'Keyboard / Mouse': 'accessory', 'Webcam': 'accessory', 'Headset': 'accessory', 'PoE Injector': 'accessory', 'CCTV Joystick / Keyboard': 'accessory', 'Battery': 'accessory', 'Walkie-Talkie Charger': 'accessory', 'Microphone': 'accessory',
};
export function profile(cat) {
  const o = (DB.masters.catFields || {})[cat]; if (o) return { show: [...o.show], req: [...o.req] };
  const k = KINDS[CAT_KIND[cat] || 'device']; return { show: [...k.show], req: [...k.req] };
}

/* ---------------- Category specification fields ---------------- */
export const S = (k, l, t, o, x) => Object.assign({ k, l, t: t || (o ? 'select' : 'text'), o }, x || {});
export const N = (k, l, x) => S(k, l, 'number', null, x);
export const YN = ['Yes', 'No'];
export const FIBRE_TYPES = ['Single-mode OS2', 'Multi-mode OM3', 'Multi-mode OM4', 'Multi-mode OM5'];
export const RACKMOUNT = [S('rackId', 'Mounted in Rack', 'aref', null, { cats: ['Rack'] }), N('uStart', 'Start U (bottom)'), S('uHeight', 'Height (U)', 0, ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12'])];
export const FW = S('firmware', 'Firmware Version');
export const COMPUTE = [S('processor', 'Processor', null, null, { r: 1 }), S('ramGB', 'RAM', 0, ['4 GB', '8 GB', '12 GB', '16 GB', '32 GB', '64 GB', '128 GB', '256 GB', '512 GB'], { r: 1 }),
  S('storageType', 'Storage Type', 0, ['SSD', 'NVMe SSD', 'HDD', 'SSD + HDD'], { r: 1 }), S('storageSize', 'Storage Size', 0, ['128 GB', '256 GB', '512 GB', '1 TB', '2 TB', '4 TB', '8 TB+']),
  S('os', 'Operating System', 0, ['Windows 11 Pro', 'Windows 10 Pro', 'Windows Server 2022', 'Windows Server 2019', 'Ubuntu', 'Other Linux', 'macOS', 'ChromeOS']),
  S('osLicence', 'OS Licence Key / Ref.'), S('hostname', 'Hostname'), S('domainJoined', 'Domain Joined', 0, YN), S('antivirus', 'Antivirus Installed', 0, YN)];
export const SWITCH = [S('totalPorts', 'Copper Ports', 0, ['5', '8', '10', '16', '24', '28', '48'], { r: 1 }), N('sfpPorts', 'SFP / Uplink Ports'),
  S('uplinkSpeed', 'Uplink Speed', 0, ['1 Gbps', '10 Gbps', '25 Gbps', '40 Gbps']), S('managed', 'Switch Type', 0, ['Managed (L2)', 'Managed (L3)', 'Smart / Web-managed', 'Unmanaged'], { r: 1 }),
  S('poe', 'PoE', 0, ['No', 'PoE (15W)', 'PoE+ (30W)', 'PoE++ (60/90W)']), N('poeBudgetW', 'PoE Budget (W)', { dep: 'poe', when: v => v.poe && v.poe !== 'No' }), S('vlans', 'VLANs Configured'),
  S('portsUsed', 'Ports in Use', 'calc', null, { calc: (v, rec) => portsInUse(rec) }), ...RACKMOUNT, FW];
export const CAMERA = [S('cameraType', 'Camera Type', 0, ['Dome', 'Bullet', 'Turret', 'Fisheye', 'Box', 'PTZ'], { r: 1 }),
  S('resolution', 'Resolution', 0, ['2 MP', '4 MP', '5 MP', '6 MP', '8 MP (4K)', '12 MP'], { r: 1 }),
  S('lens', 'Lens', 0, ['2.8 mm', '3.6 mm', '4 mm', '6 mm', '8 mm', '12 mm', '2.8–12 mm Varifocal', 'Motorised Zoom'], { r: 1 }),
  S('irRange', 'IR / Night Range', 0, ['20 m', '30 m', '40 m', '50 m', '60 m', '80 m', '100 m', '150 m', '200 m', 'Full Colour (ColorVu)']),
  S('codec', 'Video Codec', 0, ['H.264', 'H.265', 'H.265+', 'Smart H.265+']),
  S('mount', 'Installation', 0, ['Indoor', 'Outdoor'], { r: 1 }), S('ipRating', 'Weather Rating', 0, ['None (Indoor)', 'IP66', 'IP67', 'IP67 + IK10']),
  S('audio', 'Audio', 0, ['No', 'Built-in Mic', 'Audio In / Out']), S('power', 'Power Source', 0, ['PoE (Switch)', 'PoE Injector', '12V DC Adapter'], { r: 1 }),
  S('recorder', 'Recording NVR', 'aref', null, { cats: ['NVR'], r: 1 }),
  S('channel', 'NVR Channel', 'dyn', null, { dep: 'recorder', r: 1, opts: (v, rec) => nvrChannels(v.recorder, rec) }),
  S('recordMode', 'Recording Mode', 0, ['Continuous', 'Motion', 'Schedule', 'Event (AI / Line Crossing)']),
  S('viewArea', 'Coverage / View Area', null, null, { r: 1 })];
export const CAT_SPECS = {
  'Rack': [S('rackSize', 'Rack Size', 0, ['4U', '6U', '9U', '12U', '15U', '18U', '22U', '27U', '32U', '36U', '42U', '45U', '47U'], { r: 1 }),
    S('rackType', 'Rack Type', 0, ['Wall Mount', 'Floor Standing (Network)', 'Floor Standing (Server)', 'Open Frame'], { r: 1 }),
    S('width', 'Width', 0, ['600 mm', '800 mm']), S('depth', 'Depth', 0, ['450 mm', '550 mm', '600 mm', '800 mm', '1000 mm', '1200 mm']),
    S('usedU', 'U Used', 'calc', null, { calc: (v, rec) => rec ? rackUsed(rec.id) : 0 }),
    S('freeU', 'U Free', 'calc', null, { calc: (v, rec) => (parseInt(v.rackSize) || 0) - (rec ? rackUsed(rec.id) : 0) }),
    N('pduCount', 'PDUs Installed'), S('coolingFans', 'Cooling Fans', 0, YN), S('lockKey', 'Lock / Key No.'), S('rackRow', 'DC Row / Position')],
  'Patch Panel': [S('ports', 'Ports', 0, ['12', '24', '48'], { r: 1 }), S('cableType', 'Cable Type', 0, ['Cat5e', 'Cat6', 'Cat6A'], { r: 1 }), S('loaded', 'Loaded / Unloaded', 0, ['Loaded', 'Unloaded']),
    S('portsUsed', 'Ports in Use', 'calc', null, { calc: (v, rec) => portsInUse(rec) }), ...RACKMOUNT],
  'Cable Manager': [S('cmType', 'Type', 0, ['Horizontal 1U', 'Horizontal 2U', 'Vertical']), ...RACKMOUNT],
  'Switch': SWITCH, 'PoE Switch': SWITCH,
  'Router': [N('wanPorts', 'WAN Ports', { r: 1 }), N('lanPorts', 'LAN Ports', { r: 1 }), S('throughput', 'Throughput', 0, ['100 Mbps', '1 Gbps', '2 Gbps', '5 Gbps', '10 Gbps']), S('isp', 'ISP / Link'),
    S('portsUsed', 'Ports in Use', 'calc', null, { calc: (v, rec) => portsInUse(rec) }), ...RACKMOUNT, FW],
  'Firewall': [N('ports', 'Ports', { r: 1 }), S('throughput', 'Firewall Throughput', 0, ['1 Gbps', '2 Gbps', '5 Gbps', '10 Gbps', '20 Gbps+']),
    S('subscriptionExpiry', 'Security Subscription Expiry', 'date', null, { exp: 1 }), S('haPair', 'HA Pair', 0, YN),
    S('portsUsed', 'Ports in Use', 'calc', null, { calc: (v, rec) => portsInUse(rec) }), ...RACKMOUNT, FW],
  'Access Point': [S('wifiStandard', 'Wi-Fi Standard', 0, ['Wi-Fi 4', 'Wi-Fi 5', 'Wi-Fi 6', 'Wi-Fi 6E', 'Wi-Fi 7'], { r: 1 }), S('bands', 'Bands', 0, ['2.4 GHz', '5 GHz', 'Dual Band', 'Tri Band']),
    S('apMount', 'Mounting', 0, ['Ceiling', 'Wall', 'Outdoor Pole']), S('controller', 'Controller / Cloud'), S('ssids', 'SSIDs'), S('power', 'Power', 0, ['PoE (Switch)', 'PoE Injector', 'Adapter'])],
  'Wireless Controller': [N('maxAPs', 'Max APs'), N('managedAPs', 'APs Managed'), ...RACKMOUNT, FW],
  'Modem / ONT': [S('isp', 'ISP', null, null, { r: 1 }), S('connectionType', 'Connection', 0, ['Fibre (FTTH)', 'Leased Line', 'DSL', '4G / 5G']), S('bandwidth', 'Bandwidth', 0, ['50 Mbps', '100 Mbps', '200 Mbps', '500 Mbps', '1 Gbps']), S('circuitId', 'Circuit / Account ID')],
  'OFC Cable': [S('fibreType', 'Fibre Type', 0, FIBRE_TYPES, { r: 1 }), S('cores', 'Cores', 0, ['2', '4', '6', '8', '12', '24', '48', '96', '144'], { r: 1 }),
    S('construction', 'Construction', 0, ['Armoured', 'Unarmoured', 'ADSS (Aerial)', 'Indoor Tight-buffered']), N('lengthM', 'Length (m)', { r: 1 }), S('drumNo', 'Drum / Batch No.'),
    S('fromSite', 'From (Location)', 'ref', null, { c: 'locations' }), S('toSite', 'To (Location)', 'ref', null, { c: 'locations' }),
    S('route', 'Route Type', 0, ['Underground (Duct)', 'Aerial', 'Indoor Tray', 'Mixed']),
    S('coresUsed', 'Cores in Use', 'calc', null, { calc: (v, rec) => rec ? coresUsed(rec.id).length : 0 })],
  'LIU / ODF': [S('ports', 'Ports / Adapters', 0, ['6', '12', '24', '48', '96', '144'], { r: 1 }), S('connector', 'Adapter Type', 0, ['LC Duplex', 'SC Simplex', 'SC Duplex', 'FC', 'ST', 'MTP/MPO'], { r: 1 }),
    S('polish', 'Polish', 0, ['UPC', 'APC']), S('fibreMode', 'Fibre Mode', 0, FIBRE_TYPES, { r: 1 }), N('spliceTrays', 'Splice Trays'),
    S('portsUsed', 'Ports in Use', 'calc', null, { calc: (v, rec) => portsInUse(rec) }), ...RACKMOUNT],
  'Fibre Joint Closure': [S('closureType', 'Type', 0, ['Dome', 'Inline', 'Wall-mount'], { r: 1 }), N('coresSpliced', 'Cores Spliced'), S('cableIn', 'OFC In', 'aref', null, { cats: ['OFC Cable'] }), S('cableOut', 'OFC Out', 'aref', null, { cats: ['OFC Cable'] }), S('landmark', 'GPS / Landmark')],
  'Fibre Patch Cord': [S('connectors', 'Connectors', 0, ['LC–LC', 'LC–SC', 'SC–SC', 'LC–FC', 'SC–FC', 'LC–ST', 'MTP–MTP'], { r: 1 }), S('fibreMode', 'Mode', 0, FIBRE_TYPES, { r: 1 }),
    S('duplex', 'Duplex / Simplex', 0, ['Duplex', 'Simplex']), S('lengthM', 'Length', 0, ['0.5 m', '1 m', '2 m', '3 m', '5 m', '10 m', '15 m', '20 m', '30 m']), S('polish', 'Polish', 0, ['UPC', 'APC'])],
  'Pigtail': [S('connector', 'Connector', 0, ['LC', 'SC', 'FC', 'ST'], { r: 1 }), S('fibreMode', 'Mode', 0, FIBRE_TYPES, { r: 1 }), N('qty', 'Quantity')],
  'SFP Module': [S('speed', 'Speed', 0, ['1G', '10G', '25G', '40G'], { r: 1 }), S('fibreMode', 'Media', 0, [...FIBRE_TYPES, 'Copper (RJ45)'], { r: 1 }),
    S('reach', 'Reach', 0, ['100 m', '300 m (SR)', '550 m', '10 km (LR)', '20 km', '40 km (ER)', '80 km (ZR)']), S('wavelength', 'Wavelength', 0, ['850 nm', '1310 nm', '1550 nm', 'BiDi 1310/1550']),
    S('connector', 'Connector', 0, ['LC', 'SC', 'RJ45']), S('installedIn', 'Installed In (device)', 'aref', null, { cats: [...SWITCH_CATS, 'Media Converter', 'Server'] }), S('slot', 'Port / Slot')],
  'Media Converter': [S('speed', 'Speed', 0, ['100M', '1G', '10G'], { r: 1 }), S('fibreMode', 'Fibre Mode', 0, FIBRE_TYPES), S('connector', 'Fibre Connector', 0, ['LC', 'SC', 'SFP Slot']), S('linkTo', 'Connected To', 'aref')],
  'Server': [...COMPUTE, S('formFactor', 'Form Factor', 0, ['Rack 1U', 'Rack 2U', 'Rack 4U', 'Tower', 'Blade'], { r: 1 }), S('cpuCount', 'CPU Sockets', 0, ['1', '2', '4']),
    S('raid', 'RAID', 0, ['None', 'RAID 1', 'RAID 5', 'RAID 6', 'RAID 10']), S('psu', 'Power Supplies', 0, ['1', '2 (Redundant)']),
    S('virtualisation', 'Virtualisation', 0, ['None', 'VMware ESXi', 'Hyper-V', 'Proxmox', 'KVM']), S('role', 'Role / Services'), S('iloIp', 'iLO / iDRAC IP'), ...RACKMOUNT],
  'Storage / NAS': [S('bays', 'Drive Bays', 0, ['2', '4', '5', '8', '12', '16', '24'], { r: 1 }), N('drives', 'Drives Installed'), N('rawTB', 'Raw Capacity (TB)'),
    S('raid', 'RAID', 0, ['RAID 1', 'RAID 5', 'RAID 6', 'RAID 10', 'SHR']), N('usableTB', 'Usable (TB)'), S('protocols', 'Protocols', 0, ['SMB', 'NFS', 'iSCSI', 'SMB + NFS', 'SMB + NFS + iSCSI']), ...RACKMOUNT, FW],
  'Rack PDU': [S('outlets', 'Outlets', 0, ['6', '8', '12', '16', '24'], { r: 1 }), S('pduType', 'Type', 0, ['Basic', 'Metered', 'Monitored', 'Switched']), S('phase', 'Input', 0, ['Single Phase', 'Three Phase']),
    S('rating', 'Rating', 0, ['10 A', '16 A', '32 A']), S('rackId', 'Rack', 'aref', null, { cats: ['Rack'] })],
  'KVM Switch': [S('ports', 'Ports', 0, ['4', '8', '16', '32'], { r: 1 }), S('ipKvm', 'IP KVM', 0, YN), ...RACKMOUNT],
  'Precision AC': [S('capacityTR', 'Capacity', 0, ['1.5 TR', '2 TR', '3 TR', '5 TR', '7.5 TR', '10 TR'], { r: 1 }), S('acType', 'Type', 0, ['In-Row', 'Floor Mounted', 'Split (Comfort)']),
    S('setTemp', 'Set Temperature', 0, ['18 °C', '20 °C', '22 °C', '24 °C']), S('serviceDue', 'Next Service Due', 'date', null, { exp: 1 })],
  'Environment Sensor': [S('sensorType', 'Monitors', 0, ['Temperature', 'Temperature + Humidity', 'Water Leak', 'Smoke', 'Door', 'Multi-sensor'], { r: 1 }), S('threshold', 'Alarm Threshold'), S('alertTo', 'Alerts To')],
  'Fire Suppression': [S('agent', 'Agent', 0, ['FM-200', 'Novec 1230', 'CO2', 'Aerosol'], { r: 1 }), N('cylinders', 'Cylinders'), S('areaVolume', 'Protected Area / Volume'), S('refillDue', 'Refill / Hydro-test Due', 'date', null, { exp: 1 })],
  'NVR': [S('channels', 'Channels', 0, ['4', '8', '16', '32', '64', '128', '256'], { r: 1 }),
    S('channelsUsed', 'Channels in Use', 'calc', null, { calc: (v, rec) => rec ? camerasOn(rec.id).length : 0 }),
    S('incomingBw', 'Incoming Bandwidth', 0, ['80 Mbps', '160 Mbps', '256 Mbps', '320 Mbps', '400 Mbps', '640 Mbps']), N('poePorts', 'Built-in PoE Ports'),
    S('hddBays', 'HDD Bays', 0, ['1', '2', '4', '8', '16'], { r: 1 }), S('hddCount', 'HDDs Installed', 'dyn', null, { dep: 'hddBays', opts: v => range(0, parseInt(v.hddBays) || 0) }),
    S('hddSizeTB', 'Each HDD Size', 0, ['1 TB', '2 TB', '4 TB', '6 TB', '8 TB', '10 TB', '12 TB', '16 TB']),
    S('storageTB', 'Total Storage (TB)', 'calc', null, { calc: v => (parseInt(v.hddCount) || 0) * (parseFloat(v.hddSizeTB) || 0) }),
    S('raid', 'RAID', 0, ['None', 'RAID 1', 'RAID 5', 'RAID 6', 'RAID 10']), N('recordingDays', 'Recording Retention (days)'),
    S('outputs', 'Video Output', 0, ['HDMI', 'HDMI + VGA', '2 × HDMI']), ...RACKMOUNT, FW],
  'IP Camera': CAMERA,
  'PTZ Camera': [...CAMERA, S('zoom', 'Optical Zoom', 0, ['4×', '12×', '25×', '32×', '36×', '45×'], { r: 1 }), S('autoTrack', 'Auto-Tracking', 0, YN), N('presets', 'Presets Configured')],
  'Surveillance HDD': [S('capacityTB', 'Capacity', 0, ['1 TB', '2 TB', '4 TB', '6 TB', '8 TB', '10 TB', '12 TB', '16 TB'], { r: 1 }),
    S('installedIn', 'Installed In', 'aref', null, { cats: ['NVR', 'Server', 'Storage / NAS'] }),
    S('bay', 'Bay No.', 'dyn', null, { dep: 'installedIn', opts: (v, rec) => hddBays(v.installedIn, rec) }), S('health', 'Health', 0, ['Healthy', 'Warning', 'Failed'])],
  'PoE Injector': [S('poeStd', 'Standard', 0, ['PoE (15W)', 'PoE+ (30W)', 'PoE++ (60W)']), S('linkTo', 'Powering Device', 'aref', null, { cats: [...CAMERA_CATS, 'Access Point', 'IP Phone'] })],
  'CCTV Monitor': [S('screenSize', 'Screen Size', 0, ['19"', '22"', '24"', '27"', '32"', '43"', '50"', '55"', '65"'], { r: 1 }), S('displayRes', 'Resolution', 0, ['HD', 'Full HD', '4K']), S('connectedTo', 'Connected NVR', 'aref', null, { cats: ['NVR'] })],
  'Video Wall': [N('screens', 'No. of Screens', { r: 1 }), S('layout', 'Layout', 0, ['2 × 2', '3 × 2', '3 × 3', '4 × 3', '4 × 4']), S('wallController', 'Controller')],
  'CCTV Joystick / Keyboard': [S('connectedTo', 'Connected NVR', 'aref', null, { cats: ['NVR'] })],
  'Desktop': COMPUTE, 'All-in-One': COMPUTE, 'Thin Client': COMPUTE,
  'Laptop': [...COMPUTE, S('batteryHealth', 'Battery Health', 0, ['Good', 'Fair', 'Replace']), S('chargerSerial', 'Charger Serial')],
  'Tablet': [S('imei', 'IMEI'), S('os', 'Operating System', 0, ['Android', 'iPadOS', 'Windows']), S('mobileNo', 'SIM / Mobile No.', 'tel')],
  'Monitor': [S('screenSize', 'Screen Size', 0, ['19"', '22"', '24"', '27"', '32"'], { r: 1 }), S('displayRes', 'Resolution', 0, ['HD', 'Full HD', 'QHD', '4K']), S('inputs', 'Inputs', 0, ['VGA', 'HDMI', 'VGA + HDMI', 'HDMI + DP', 'USB-C']), S('connectedTo', 'Connected To', 'aref', null, { cats: ['Desktop', 'Thin Client', 'Server', 'Laptop'] })],
  'Keyboard / Mouse': [S('connection', 'Connection', 0, ['Wired (USB)', 'Wireless'])], 'Webcam': [S('resolution', 'Resolution', 0, ['720p', '1080p', '4K'])],
  'Headset': [S('connection', 'Connection', 0, ['3.5 mm', 'USB', 'Bluetooth'])], 'External HDD': [S('capacity', 'Capacity', 0, ['500 GB', '1 TB', '2 TB', '4 TB', '5 TB'], { r: 1 })],
  'Printer': [S('printerType', 'Printer Type', 0, ['Laser', 'Inkjet', 'Ink Tank', 'Dot Matrix', 'Thermal'], { r: 1 }), S('colour', 'Colour', 0, ['Mono', 'Colour'], { r: 1 }), S('paper', 'Paper Size', 0, ['A4', 'A3', 'Legal']),
    S('connectivity', 'Connectivity', 0, ['USB', 'Network', 'Wi-Fi', 'Network + Wi-Fi']), S('cartridge', 'Cartridge / Toner Model'), N('pageCount', 'Page Count')],
  'Multifunction Printer': [S('printerType', 'Printer Type', 0, ['Laser', 'Inkjet', 'Ink Tank'], { r: 1 }), S('colour', 'Colour', 0, ['Mono', 'Colour'], { r: 1 }), S('functions', 'Functions', 0, ['Print + Scan + Copy', 'Print + Scan + Copy + Fax']),
    S('paper', 'Paper Size', 0, ['A4', 'A3']), S('connectivity', 'Connectivity', 0, ['USB', 'Network', 'Network + Wi-Fi']), S('cartridge', 'Cartridge / Toner Model'), N('pageCount', 'Page Count')],
  'Scanner': [S('scannerType', 'Scanner Type', 0, ['Flatbed', 'ADF', 'Sheet-fed', 'Document Camera'], { r: 1 }), S('connectivity', 'Connectivity', 0, ['USB', 'Network', 'Wi-Fi'])],
  'Label / Barcode Printer': [S('printWidth', 'Print Width', 0, ['2 inch', '3 inch', '4 inch']), S('connectivity', 'Connectivity', 0, ['USB', 'Network', 'Bluetooth'])],
  'UPS': [S('capacity', 'Capacity', 0, ['600 VA', '1 kVA', '2 kVA', '3 kVA', '5 kVA', '6 kVA', '10 kVA', '20 kVA', '40 kVA', '60 kVA'], { r: 1 }), S('upsType', 'UPS Type', 0, ['Offline', 'Line Interactive', 'Online'], { r: 1 }),
    S('upsForm', 'Form', 0, ['Tower', 'Rack Mount']), N('batteryCount', 'No. of Batteries'), S('batteryRating', 'Battery Rating', 0, ['12V 7Ah', '12V 9Ah', '12V 26Ah', '12V 42Ah', '12V 65Ah', '12V 100Ah']),
    S('batteryReplacedOn', 'Batteries Replaced On', 'date'), S('batteryDue', 'Battery Replacement Due', 'date', null, { exp: 1 }), N('backupMins', 'Backup (minutes)'), S('connectedLoad', 'Connected Load'), ...RACKMOUNT],
  'UPS Battery Bank': [N('batteryCount', 'Batteries', { r: 1 }), S('batteryRating', 'Battery Rating', 0, ['12V 26Ah', '12V 42Ah', '12V 65Ah', '12V 100Ah', '12V 150Ah']), S('linkTo', 'Connected UPS', 'aref', null, { cats: ['UPS'] }), S('batteryDue', 'Replacement Due', 'date', null, { exp: 1 })],
  'Inverter': [S('capacity', 'Capacity', 0, ['900 VA', '1100 VA', '1500 VA', '2 kVA', '3.5 kVA', '5 kVA'], { r: 1 }), N('batteryCount', 'No. of Batteries'), S('batteryDue', 'Battery Replacement Due', 'date', null, { exp: 1 })],
  'Battery': [S('rating', 'Rating', 0, ['12V 7Ah', '12V 9Ah', '12V 26Ah', '12V 42Ah', '12V 65Ah', '12V 100Ah', '12V 150Ah'], { r: 1 }), S('installedIn', 'Installed In', 'aref', null, { cats: ['UPS', 'Inverter', 'UPS Battery Bank'] }), S('installedOn', 'Installed On', 'date')],
  'Stabilizer': [S('capacity', 'Capacity', 0, ['1 kVA', '2 kVA', '3 kVA', '5 kVA', '10 kVA'], { r: 1 })],
  'Walkie-Talkie': [S('setNo', 'Set No.', null, null, { r: 1, hint: 'e.g. WT-001' }), S('band', 'Frequency Band', 0, ['UHF', 'VHF'], { r: 1 }), N('channels', 'Channels'), S('batteryNo', 'Battery No.'), S('wpcLicence', 'WPC Licence No.')],
  'Walkie-Talkie Charger': [S('slots', 'Charging Slots', 0, ['1', '6'])],
  'IP Phone': [S('extension', 'Extension', null, null, { r: 1 }), S('power', 'Power', 0, ['PoE (Switch)', 'Adapter'])], 'EPABX': [N('lines', 'Trunk Lines'), N('extensions', 'Extensions')],
  'Mobile Phone': [S('imei', 'IMEI', null, null, { r: 1 }), S('os', 'Operating System', 0, ['Android', 'iOS']), S('mobileNo', 'SIM / Mobile No.', 'tel')],
  'Biometric Device': [S('bioType', 'Type', 0, ['Fingerprint', 'Face', 'Card', 'Multi-mode'], { r: 1 }), N('userCapacity', 'User Capacity'), S('purpose', 'Used For', 0, ['Attendance', 'Access Control'])],
  'Projector': [N('lumens', 'Brightness (lumens)'), S('projRes', 'Resolution', 0, ['SVGA', 'XGA', 'WXGA', 'Full HD', '4K']), N('lampHours', 'Lamp Hours Used'), S('inputs', 'Inputs', 0, ['HDMI', 'HDMI + VGA', 'HDMI + VGA + LAN'])],
  'TV / Display': [S('screenSize', 'Screen Size', 0, ['32"', '43"', '50"', '55"', '65"', '75"', '86"'], { r: 1 }), S('displayRes', 'Resolution', 0, ['HD', 'Full HD', '4K']), S('smart', 'Smart TV', 0, YN)],
  'LED Screen': [S('size', 'Size (W × H)', null, null, { r: 1 }), S('pitch', 'Pixel Pitch', 0, ['P2.5', 'P3', 'P3.9', 'P4', 'P5', 'P6', 'P10']), S('ledController', 'Controller')],
  'Speaker / Amplifier': [N('watts', 'Power (W)'), S('channels', 'Channels', 0, ['Mono', 'Stereo', '4-Zone', '8-Zone'])],
  'Microphone': [S('micType', 'Type', 0, ['Wired', 'Wireless Handheld', 'Collar / Lapel', 'Gooseneck', 'Headset'], { r: 1 })],
  'Video Conferencing Unit': [S('camera', 'Camera'), S('platform', 'Platform', 0, ['Microsoft Teams', 'Zoom', 'Google Meet', 'Multi-platform'])],
};
export const slug = s => 'c_' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export function specsFor(cat) {
  const hidden = ((DB.masters.hiddenSpecs || {})[cat]) || [];
  const custom = ((DB.masters.customSpecs || {})[cat] || []).map(c => typeof c === 'string' ? S(slug(c), c) : S(slug(c.l), c.l, c.t === 'select' ? 'select' : (c.t || 'text'), c.t === 'select' ? c.o : null, { r: c.r ? 1 : 0 }));
  return [...(CAT_SPECS[cat] || []).filter(f => !hidden.includes(f.k)), ...custom];
}
export function catGroupOf(cat) { for (const [g, l] of Object.entries(DB.masters.catGroups || {})) if (l.includes(cat)) return g; return 'Other'; }
export const GROUP_COLOR = { 'Network & Rack': '#2e5a88', 'Fibre & OFC': '#0f766e', 'Data Centre': '#6d3fa0', 'CCTV (IP)': '#2f7d4f', 'Power': '#b45309', 'Computing (End User)': '#475467' };

/* ---------------- Relationship helpers ---------------- */
export const getA = id => DB.assets.find(a => a.id === id);
export const tagOf = id => { const a = getA(id); return a ? a.assetTag : ''; };
export function nextTag() { let mx = 0; DB.assets.forEach(a => { const m = String(a.assetTag).match(/(\d+)\s*$/); if (m) mx = Math.max(mx, +m[1]); }); return 'DJJS-IT-' + String(mx + 1).padStart(4, '0'); }
export function camerasOn(nvrId) { return DB.assets.filter(a => live(a) && CAMERA_CATS.includes(a.categoryId) && (a.specs || {}).recorder === nvrId); }
export function nvrChannels(nvrId, rec) {
  const n = getA(nvrId); if (!n) return [];
  const tot = parseInt((n.specs || {}).channels) || 0; const used = {};
  camerasOn(nvrId).forEach(c => { if (!rec || c.id !== rec.id) used[c.specs.channel] = c.assetTag; });
  return range(1, tot).map(ch => ({ v: ch, l: 'Channel ' + ch + (used[ch] ? ' — used by ' + used[ch] : ''), dis: !!used[ch] }));
}
export function hddBays(devId, rec) {
  const n = getA(devId); if (!n) return [];
  const s = n.specs || {}; const tot = parseInt(s.hddBays) || parseInt(s.bays) || 0; const used = {};
  DB.assets.forEach(a => { if (a.id !== (rec && rec.id) && live(a) && (a.specs || {}).installedIn === devId && a.specs.bay) used[a.specs.bay] = a.assetTag; });
  return range(1, tot).map(b => ({ v: b, l: 'Bay ' + b + (used[b] ? ' — ' + used[b] : ''), dis: !!used[b] }));
}
export function rackDevices(rackId) { return DB.assets.filter(a => live(a) && (a.specs || {}).rackId === rackId && num(a.specs.uStart) > 0); }
export function rackUsed(rackId) { return rackDevices(rackId).reduce((s, a) => s + (parseInt(a.specs.uHeight) || 1), 0); }
export function rackCheck(rackId, start, height, exceptId) {
  const r = getA(rackId); if (!r) return 'Select a rack';
  const size = parseInt((r.specs || {}).rackSize) || 0; const st = parseInt(start); const h = parseInt(height) || 1;
  if (!st || st < 1) return 'Enter the Start U (1 = bottom of rack)';
  if (st + h - 1 > size) return `${r.assetTag} is ${size}U — U${st} to U${st + h - 1} does not fit`;
  const c = rackDevices(rackId).find(a => a.id !== exceptId && st <= num(a.specs.uStart) + (parseInt(a.specs.uHeight) || 1) - 1 && num(a.specs.uStart) <= st + h - 1);
  if (c) return `U${st}${h > 1 ? '–U' + (st + h - 1) : ''} overlaps ${c.assetTag} (${c.name}) at U${c.specs.uStart}${(parseInt(c.specs.uHeight) || 1) > 1 ? '–U' + (num(c.specs.uStart) + (parseInt(c.specs.uHeight) || 1) - 1) : ''}`;
  return '';
}
export function parseCores(s) { const r = []; String(s || '').split(/[,\s]+/).forEach(p => { const m = p.match(/^(\d+)(?:-(\d+))?$/); if (m) { const a = +m[1], b = +(m[2] || m[1]); for (let i = Math.min(a, b); i <= Math.max(a, b) && r.length < 500; i++) r.push(i); } }); return r; }
export function coresUsed(ofcId, exceptLinkId) { const out = []; DB.networkLinks.filter(l => l.ofcCableId === ofcId && l.id !== exceptLinkId && l.status !== 'Disconnected').forEach(l => parseCores(l.cores).forEach(c => out.push(c))); return out; }
export function basePorts(a) { const s = a.specs || {}; return parseInt(s.totalPorts) || parseInt(s.ports) || (num(s.wanPorts) + num(s.lanPorts)) || 0; }
export function portList(a) {
  if (!a) return [];
  const s = a.specs || {}; const n = basePorts(a); const sfp = parseInt(s.sfpPorts) || 0; const map = {};
  const t = a.categoryId === 'LIU / ODF' ? 'Fibre ' + (s.connector || 'LC') : 'RJ45';
  for (let i = 1; i <= n; i++) map[i] = { no: i, type: t, status: 'Free' };
  for (let i = n + 1; i <= n + sfp; i++) map[i] = { no: i, type: 'SFP', status: 'Free' };
  (a.ports || []).forEach(p => { map[p.no] = Object.assign({}, map[p.no] || { manual: true }, p); });
  return Object.values(map).sort((x, y) => x.no - y.no);
}
export function portUsers(devId, ex) {
  const u = {}; if (!devId) return u;
  DB.assets.forEach(a => { if (a.id !== ex && live(a) && a.connSwitch === devId && a.connPort) u[a.connPort] = a.assetTag + ' (' + a.name + ')'; });
  DB.networkLinks.forEach(l => {
    if (l.id === ex || l.status === 'Disconnected') return;
    if (l.sourceDeviceId === devId && l.sourcePort) u[l.sourcePort] = 'Link ' + l.refNo;
    if (l.destinationDeviceId === devId && l.destinationPort) u[l.destinationPort] = 'Link ' + l.refNo;
    if (l.sourceLiuId === devId && l.sourceLiuPort) u[l.sourceLiuPort] = 'Link ' + l.refNo;
    if (l.destLiuId === devId && l.destLiuPort) u[l.destLiuPort] = 'Link ' + l.refNo;
  });
  return u;
}
export function portsInUse(rec) { if (!rec) return 0; const used = new Set(); (rec.ports || []).forEach(p => { if (p.status === 'Active') used.add(String(p.no)); }); Object.keys(portUsers(rec.id)).forEach(k => used.add(String(k))); return used.size; }
export function portOpts(devId, cur, ex) {
  const a = getA(devId); if (!a) return null; const list = portList(a); if (!list.length) return null;
  const users = portUsers(devId, ex);
  return list.map(p => ({ v: String(p.no), l: `Port ${p.no} · ${p.type}` + (users[p.no] ? ' — ' + users[p.no] : p.status && p.status !== 'Free' && p.status !== 'Active' ? ' — ' + p.status : ''), dis: !!users[p.no] || ['Disabled', 'Faulty'].includes(p.status) }));
}
export const ATTEN = { '850 nm': 3.0, '1300 nm': 1.0, '1310 nm': 0.35, '1550 nm': 0.25 };
export function lossBudget(v) { if (!v.distanceM && !v.connectors && !v.splices) return ''; return +((num(v.distanceM) / 1000) * (ATTEN[v.wavelength] || 0.35) + num(v.connectors) * 0.5 + num(v.splices) * 0.1).toFixed(2); }
export function lossResult(v) { const b = lossBudget(v); if (v.measuredLossDb === '' || v.measuredLossDb == null || b === '') return 'Not Tested'; return num(v.measuredLossDb) <= b ? 'Pass' : 'Fail'; }
export const partsTotal = rows => (rows || []).reduce((s, p) => s + num(p.qty || 1) * num(p.unitCost), 0);

/* ---------------- Labels ---------------- */
export function locPath(id, depth = 0) {
  const l = (DB.locations || []).find(x => x.id === id); if (!l) return '';
  const p = l.parentId && depth < 6 ? locPath(l.parentId, depth + 1) : '';
  return p ? p + ' › ' + l.siteName : l.siteName;
}
export function label(c, id) {
  if (!id) return '';
  const r = (DB[c] || []).find(x => x.id === id); if (!r) return '(deleted)';
  switch (c) {
    case 'assets': return r.assetTag + ' — ' + r.name;
    case 'employees': return r.name + (r.employeeCode ? ' (' + r.employeeCode + ')' : '');
    case 'locations': return locPath(id);
    case 'vendors': return r.name;
    case 'purchases': return r.poNumber;
    case 'contracts': return r.contractNumber;
    case 'roles': return r.name;
    case 'repairJobs': return r.jobNumber + ' — ' + (r.assetId ? tagOf(r.assetId) : r.itemDescription);
    default: return r.name || r.refNo || id;
  }
}
export const optLabel = (c, r) => c === 'assets' ? `${r.assetTag} — ${r.name} [${r.status}]` : label(c, r.id);
export const M = k => k === 'categories' ? Object.values(DB.masters.catGroups || {}).flat() : (DB.masters[k] || []);
export function comboList(k) {
  const m = DB.masters; const act = (DB.employees || []).filter(e => e.active !== 'No');
  if (k === 'staff') return uniq([...(m.staff || []), ...(DB.users || []).filter(u => u.active !== 'No').map(u => u.name), ...act.filter(e => e.department === 'IT').map(e => e.name)]).sort();
  if (k === 'technicians') return uniq([...(m.technicians || []), ...act.filter(e => e.department === 'IT').map(e => e.name), ...(DB.vendors || []).filter(v => v.status !== 'Blacklisted').map(v => v.name)]).sort();
  if (k === 'persons') return uniq([...act.map(e => e.name), ...(m.persons || [])]).sort();
  if (k === 'manufacturers') return uniq([...(m.manufacturers || []), ...(DB.assets || []).map(a => a.manufacturer)]).sort();
  return M(k);
}
export const COMBO_KEYS = ['staff', 'technicians', 'persons', 'manufacturers', 'designations'];
export function dispStatus(mod, r) {
  if (mod === 'tempAssignments' && r.status === 'Issued' && daysTo(r.dueAt) < 0) return 'Overdue';
  if (mod === 'repairDispatches' && r.status !== 'Received Back' && daysTo(r.expectedReturnAt) < 0) return 'Overdue at Vendor';
  return r.status;
}
export const findPerson = name => (DB.employees || []).find(e => (e.name || '').toLowerCase() === String(name || '').toLowerCase());

/* ---------------- Field validation rules ---------------- */
export const V_RULES = {
  phone: [/^\d{10,12}$/, 'must be 10–12 digits (numbers only)'],
  pin: [/^\d{6}$/, 'must be 6 digits'],
  email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'is not a valid email address'],
  ip: [/^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/, 'is not a valid IPv4 address'],
  mac: [/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i, 'must look like AA:BB:CC:DD:EE:FF'],
  gstin: [/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i, 'must be a 15-character GSTIN'],
  username: [/^[a-z0-9._-]{3,}$/i, 'may use letters, numbers, dot, dash (min 3)'],
};
export function checkV(f, v) {
  if (f.t === 'number' && num(v) < 0) return f.l + ' cannot be negative';
  if (f.v && V_RULES[f.v] && !V_RULES[f.v][0].test(String(v))) return f.l + ' ' + V_RULES[f.v][1];
  return '';
}
