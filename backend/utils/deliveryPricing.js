function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// 3-digit PIN code Sorting District Centroids across India
const PINCODE_PREFIX_COORDINATES = {
  // Karnataka (Bangalore and surrounding)
  "560": { lat: 12.9716, lon: 77.5946, name: "Bangalore Urban & Rural" },
  "561": { lat: 13.2924, lon: 77.5428, name: "Bangalore Rural / Chikkaballapura" },
  "562": { lat: 12.7209, lon: 77.2799, name: "Ramanagara / Bangalore Outskirts" },
  "563": { lat: 13.1367, lon: 78.1291, name: "Kolar / KGF" },

  // Karnataka (Central, Southern & Coastal)
  "570": { lat: 12.2958, lon: 76.6394, name: "Mysore" },
  "571": { lat: 12.5226, lon: 76.8976, name: "Mandya / Chamarajanagar" },
  "572": { lat: 13.3409, lon: 77.1010, name: "Tumkur" },
  "573": { lat: 13.0068, lon: 76.1004, name: "Hassan" },
  "574": { lat: 12.7846, lon: 75.2042, name: "Dakshina Kannada Rural" },
  "575": { lat: 12.9141, lon: 74.8560, name: "Mangalore City" },
  "576": { lat: 13.3409, lon: 74.7421, name: "Udupi / Manipal" },
  "577": { lat: 13.9299, lon: 75.5681, name: "Shimoga / Davanagere / Chikmagalur" },

  // Karnataka (Northern)
  "580": { lat: 15.3647, lon: 75.1240, name: "Hubli / Dharwad" },
  "581": { lat: 14.8185, lon: 74.1352, name: "Uttara Kannada / Karwar" },
  "582": { lat: 15.4299, lon: 75.6322, name: "Gadag" },
  "583": { lat: 15.1394, lon: 76.9214, name: "Bellary / Hospet" },
  "584": { lat: 16.2076, lon: 77.3463, name: "Raichur / Koppal" },
  "585": { lat: 17.3297, lon: 76.8343, name: "Kalaburagi / Bidar / Yadgir" },
  "586": { lat: 16.8302, lon: 75.7100, name: "Vijayapura / Bijapur" },
  "587": { lat: 16.1817, lon: 75.6958, name: "Bagalkot" },
  "590": { lat: 15.8497, lon: 74.4977, name: "Belagavi City" },
  "591": { lat: 16.1700, lon: 74.6300, name: "Belagavi Rural / Chikkodi" },

  // Tamil Nadu & Puducherry
  "600": { lat: 13.0827, lon: 80.2707, name: "Chennai" },
  "601": { lat: 13.1500, lon: 80.0000, name: "Tiruvallur" },
  "602": { lat: 13.0000, lon: 79.8000, name: "Kanchipuram" },
  "603": { lat: 12.6800, lon: 79.9800, name: "Chengalpattu" },
  "605": { lat: 11.9416, lon: 79.8083, name: "Puducherry" },
  "610": { lat: 10.7870, lon: 79.1378, name: "Thanjavur / Tiruvarur" },
  "620": { lat: 10.7905, lon: 78.7047, name: "Tiruchirappalli" },
  "625": { lat: 9.9252, lon: 78.1198, name: "Madurai" },
  "627": { lat: 8.7139, lon: 77.7567, name: "Tirunelveli" },
  "628": { lat: 8.7642, lon: 78.1348, name: "Thoothukudi" },
  "629": { lat: 8.1833, lon: 77.4119, name: "Kanyakumari / Nagercoil" },
  "632": { lat: 12.9165, lon: 79.1325, name: "Vellore" },
  "635": { lat: 12.7409, lon: 77.8253, name: "Hosur / Krishnagiri" }, // Border ~40km from Bangalore
  "636": { lat: 11.6643, lon: 78.1460, name: "Salem" },
  "638": { lat: 11.3410, lon: 77.7172, name: "Erode" },
  "641": { lat: 11.0168, lon: 76.9558, name: "Coimbatore" },
  "643": { lat: 11.4100, lon: 76.6950, name: "Nilgiris / Ooty" },

  // Kerala & Lakshadweep
  "670": { lat: 11.8745, lon: 75.3704, name: "Kannur" },
  "671": { lat: 12.5102, lon: 74.9852, name: "Kasaragod" },
  "673": { lat: 11.2588, lon: 75.7804, name: "Kozhikode / Calicut" },
  "676": { lat: 11.0510, lon: 76.0711, name: "Malappuram" },
  "678": { lat: 10.7867, lon: 76.6548, name: "Palakkad" },
  "680": { lat: 10.5276, lon: 76.2144, name: "Thrissur" },
  "682": { lat: 9.9312, lon: 76.2673, name: "Ernakulam / Kochi" },
  "685": { lat: 9.8500, lon: 76.9700, name: "Idukki" },
  "686": { lat: 9.5916, lon: 76.5222, name: "Kottayam" },
  "688": { lat: 9.4981, lon: 76.3388, name: "Alappuzha" },
  "691": { lat: 8.8932, lon: 76.6141, name: "Kollam" },
  "695": { lat: 8.5241, lon: 76.9366, name: "Thiruvananthapuram" },

  // Andhra Pradesh & Telangana
  "500": { lat: 17.3850, lon: 78.4867, name: "Hyderabad / Secunderabad" },
  "501": { lat: 17.2000, lon: 78.5000, name: "Rangareddy" },
  "502": { lat: 17.6200, lon: 78.0800, name: "Medak / Sangareddy" },
  "503": { lat: 18.6700, lon: 78.1000, name: "Nizamabad" },
  "505": { lat: 18.4386, lon: 79.1288, name: "Karimnagar" },
  "506": { lat: 17.9689, lon: 79.5941, name: "Warangal" },
  "515": { lat: 14.6819, lon: 77.6006, name: "Anantapur / Hindupur" },
  "516": { lat: 14.4673, lon: 78.8242, name: "Kadapa" },
  "517": { lat: 13.2172, lon: 79.1003, name: "Chittoor / Tirupati" },
  "518": { lat: 15.8281, lon: 78.0373, name: "Kurnool" },
  "520": { lat: 16.5062, lon: 80.6480, name: "Vijayawada" },
  "522": { lat: 16.3067, lon: 80.4365, name: "Guntur" },
  "524": { lat: 14.4426, lon: 79.9865, name: "Nellore" },
  "530": { lat: 17.6868, lon: 83.2185, name: "Visakhapatnam" },
  "533": { lat: 16.9891, lon: 82.2475, name: "Kakinada" },

  // Maharashtra & Goa
  "400": { lat: 18.9322, lon: 72.8354, name: "Mumbai South / Central" },
  "401": { lat: 19.3919, lon: 72.8397, name: "Thane / Palghar" },
  "402": { lat: 18.5200, lon: 73.1800, name: "Raigad" },
  "403": { lat: 15.4909, lon: 73.8278, name: "Goa (Panaji)" },
  "411": { lat: 18.5204, lon: 73.8567, name: "Pune" },
  "413": { lat: 17.6599, lon: 75.9064, name: "Solapur" },
  "414": { lat: 19.0952, lon: 74.7496, name: "Ahmednagar" },
  "415": { lat: 17.6805, lon: 74.0183, name: "Satara" },
  "416": { lat: 16.7050, lon: 74.2433, name: "Kolhapur / Sangli" },
  "421": { lat: 19.2437, lon: 73.1355, name: "Kalyan / Dombivli" },
  "422": { lat: 19.9975, lon: 73.7898, name: "Nashik" },
  "424": { lat: 20.9042, lon: 74.7749, name: "Dhule" },
  "425": { lat: 21.0077, lon: 75.5626, name: "Jalgaon" },
  "431": { lat: 19.8762, lon: 75.3433, name: "Aurangabad / Chhatrapati Sambhajinagar" },
  "440": { lat: 21.1458, lon: 79.0882, name: "Nagpur" },
  "444": { lat: 20.9320, lon: 77.7523, name: "Amravati / Akola" },

  // Gujarat
  "380": { lat: 23.0225, lon: 72.5714, name: "Ahmedabad" },
  "382": { lat: 23.2156, lon: 72.6369, name: "Gandhinagar" },
  "388": { lat: 22.5645, lon: 72.9289, name: "Anand" },
  "390": { lat: 22.3072, lon: 73.1812, name: "Vadodara" },
  "395": { lat: 21.1702, lon: 72.8311, name: "Surat" },
  "396": { lat: 20.6100, lon: 72.9300, name: "Valsad / Navsari" },
  "360": { lat: 22.3039, lon: 70.8022, name: "Rajkot" },
  "361": { lat: 22.4707, lon: 70.0577, name: "Jamnagar" },
  "362": { lat: 21.5222, lon: 70.4579, name: "Junagadh" },
  "364": { lat: 21.7645, lon: 72.1519, name: "Bhavnagar" },
  "370": { lat: 23.2420, lon: 69.6669, name: "Bhuj / Kutch" },

  // Madhya Pradesh & Chhattisgarh
  "452": { lat: 22.7196, lon: 75.8577, name: "Indore" },
  "456": { lat: 23.1765, lon: 75.7885, name: "Ujjain" },
  "462": { lat: 23.2599, lon: 77.4126, name: "Bhopal" },
  "474": { lat: 26.2183, lon: 78.1828, name: "Gwalior" },
  "482": { lat: 23.1815, lon: 79.9864, name: "Jabalpur" },
  "490": { lat: 21.1904, lon: 81.3509, name: "Bhilai / Durg" },
  "492": { lat: 21.2514, lon: 81.6296, name: "Raipur" },
  "495": { lat: 22.0797, lon: 82.1409, name: "Bilaspur" },

  // Rajasthan
  "302": { lat: 26.9124, lon: 75.7873, name: "Jaipur" },
  "301": { lat: 27.5530, lon: 76.6346, name: "Alwar" },
  "305": { lat: 26.4499, lon: 74.6399, name: "Ajmer" },
  "311": { lat: 25.3407, lon: 74.6313, name: "Bhilwara" },
  "313": { lat: 24.5854, lon: 73.7125, name: "Udaipur" },
  "324": { lat: 25.2138, lon: 75.8648, name: "Kota" },
  "334": { lat: 28.0229, lon: 73.3119, name: "Bikaner" },
  "342": { lat: 26.2389, lon: 73.0243, name: "Jodhpur" },

  // Delhi & NCR
  "110": { lat: 28.6139, lon: 77.2090, name: "Delhi" },
  "121": { lat: 28.4089, lon: 77.3178, name: "Faridabad" },
  "122": { lat: 28.4595, lon: 77.0266, name: "Gurugram" },
  "201": { lat: 28.5355, lon: 77.3910, name: "Noida / Ghaziabad" },

  // Uttar Pradesh & Uttarakhand
  "208": { lat: 26.4499, lon: 80.3319, name: "Kanpur" },
  "226": { lat: 26.8467, lon: 80.9462, name: "Lucknow" },
  "221": { lat: 25.3176, lon: 82.9739, name: "Varanasi" },
  "211": { lat: 25.4358, lon: 81.8463, name: "Prayagraj / Allahabad" },
  "282": { lat: 27.1767, lon: 78.0081, name: "Agra" },
  "250": { lat: 28.9845, lon: 77.7064, name: "Meerut" },
  "243": { lat: 28.3670, lon: 79.4304, name: "Bareilly" },
  "273": { lat: 26.7606, lon: 83.3732, name: "Gorakhpur" },
  "248": { lat: 30.3165, lon: 78.0322, name: "Dehradun" },
  "249": { lat: 29.9457, lon: 78.1642, name: "Haridwar / Rishikesh" },

  // Punjab, Haryana, HP, J&K, Chandigarh
  "160": { lat: 30.7333, lon: 76.7794, name: "Chandigarh" },
  "141": { lat: 30.9010, lon: 75.8573, name: "Ludhiana" },
  "143": { lat: 31.6340, lon: 74.8723, name: "Amritsar" },
  "144": { lat: 31.3260, lon: 75.5762, name: "Jalandhar" },
  "133": { lat: 30.3782, lon: 76.7767, name: "Ambala" },
  "132": { lat: 29.3909, lon: 76.9635, name: "Panipat / Karnal" },
  "171": { lat: 31.1048, lon: 77.1734, name: "Shimla" },
  "176": { lat: 32.2190, lon: 76.3234, name: "Dharamshala" },
  "180": { lat: 32.7266, lon: 74.8570, name: "Jammu" },
  "190": { lat: 34.0837, lon: 74.7973, name: "Srinagar" },
  "194": { lat: 34.1526, lon: 77.5771, name: "Leh / Ladakh" },

  // West Bengal, Odisha, Bihar, Jharkhand
  "700": { lat: 22.5726, lon: 88.3639, name: "Kolkata" },
  "711": { lat: 22.5958, lon: 88.2636, name: "Howrah" },
  "734": { lat: 26.7271, lon: 88.3953, name: "Siliguri / Darjeeling" },
  "751": { lat: 20.2961, lon: 85.8245, name: "Bhubaneswar" },
  "753": { lat: 20.4625, lon: 85.8830, name: "Cuttack" },
  "769": { lat: 22.2604, lon: 84.8536, name: "Rourkela" },
  "800": { lat: 25.5941, lon: 85.1376, name: "Patna" },
  "834": { lat: 23.3441, lon: 85.3096, name: "Ranchi" },
  "831": { lat: 22.8046, lon: 86.2029, name: "Jamshedpur" },

  // North-East & Islands
  "781": { lat: 26.1445, lon: 91.7362, name: "Guwahati / Assam" },
  "793": { lat: 25.5788, lon: 91.8933, name: "Shillong / Meghalaya" },
  "795": { lat: 24.8170, lon: 93.9368, name: "Imphal / Manipur" },
  "796": { lat: 23.7271, lon: 92.7176, name: "Aizawl / Mizoram" },
  "797": { lat: 25.6751, lon: 94.1086, name: "Kohima / Nagaland" },
  "799": { lat: 23.8315, lon: 91.2868, name: "Agartala / Tripura" },
  "737": { lat: 27.3389, lon: 88.6065, name: "Gangtok / Sikkim" },
  "744": { lat: 11.6234, lon: 92.7265, name: "Port Blair / Andaman" }
};

// 2-digit Circle prefix fallback
const PINCODE_2DIGIT_COORDINATES = {
  "11": { lat: 28.6139, lon: 77.2090, name: "Delhi" },
  "12": { lat: 28.4595, lon: 77.0266, name: "Haryana (South)" },
  "13": { lat: 30.3782, lon: 76.7767, name: "Haryana (North)" },
  "14": { lat: 30.9010, lon: 75.8573, name: "Punjab" },
  "15": { lat: 30.2110, lon: 74.9455, name: "Punjab (South)" },
  "16": { lat: 30.7333, lon: 76.7794, name: "Chandigarh" },
  "17": { lat: 31.1048, lon: 77.1734, name: "Himachal Pradesh" },
  "18": { lat: 32.7266, lon: 74.8570, name: "Jammu" },
  "19": { lat: 34.0837, lon: 74.7973, name: "Kashmir & Ladakh" },
  "20": { lat: 27.4924, lon: 77.6737, name: "Uttar Pradesh (West)" },
  "21": { lat: 25.4358, lon: 81.8463, name: "Uttar Pradesh (South)" },
  "22": { lat: 26.8467, lon: 80.9462, name: "Uttar Pradesh (Central)" },
  "23": { lat: 25.3176, lon: 82.9739, name: "Uttar Pradesh (East)" },
  "24": { lat: 30.3165, lon: 78.0322, name: "Uttarakhand / UP West" },
  "25": { lat: 29.9678, lon: 77.5510, name: "Uttar Pradesh (Northwest)" },
  "26": { lat: 29.3803, lon: 79.4636, name: "Uttarakhand (Kumaon)" },
  "27": { lat: 26.7606, lon: 83.3732, name: "Uttar Pradesh (Northeast)" },
  "28": { lat: 25.4484, lon: 78.5685, name: "Uttar Pradesh (Bundelkhand)" },
  "30": { lat: 26.9124, lon: 75.7873, name: "Rajasthan (Jaipur / Central)" },
  "31": { lat: 24.5854, lon: 73.7125, name: "Rajasthan (South)" },
  "32": { lat: 25.2138, lon: 75.8648, name: "Rajasthan (East)" },
  "33": { lat: 28.0229, lon: 73.3119, name: "Rajasthan (North)" },
  "34": { lat: 26.2389, lon: 73.0243, name: "Rajasthan (West)" },
  "36": { lat: 22.3039, lon: 70.8022, name: "Gujarat (Saurashtra)" },
  "37": { lat: 23.2420, lon: 69.6669, name: "Gujarat (Kutch)" },
  "38": { lat: 23.0225, lon: 72.5714, name: "Gujarat (Ahmedabad / North)" },
  "39": { lat: 21.1702, lon: 72.8311, name: "Gujarat (Surat / South)" },
  "40": { lat: 19.0760, lon: 72.8777, name: "Maharashtra (Mumbai / Konkan)" },
  "41": { lat: 18.5204, lon: 73.8567, name: "Maharashtra (Pune / Western)" },
  "42": { lat: 19.9975, lon: 73.7898, name: "Maharashtra (Nashik / North)" },
  "43": { lat: 19.8762, lon: 75.3433, name: "Maharashtra (Marathwada)" },
  "44": { lat: 21.1458, lon: 79.0882, name: "Maharashtra (Vidarbha)" },
  "45": { lat: 22.7196, lon: 75.8577, name: "Madhya Pradesh (Indore / Malwa)" },
  "46": { lat: 23.2599, lon: 77.4126, name: "Madhya Pradesh (Bhopal / Central)" },
  "47": { lat: 26.2183, lon: 78.1828, name: "Madhya Pradesh (Gwalior / North)" },
  "48": { lat: 23.1815, lon: 79.9864, name: "Madhya Pradesh (Jabalpur / East)" },
  "49": { lat: 21.2514, lon: 81.6296, name: "Chhattisgarh" },
  "50": { lat: 17.3850, lon: 78.4867, name: "Telangana" },
  "51": { lat: 14.6819, lon: 77.6006, name: "Andhra Pradesh (Rayalaseema)" },
  "52": { lat: 16.5062, lon: 80.6480, name: "Andhra Pradesh (Central Coastal)" },
  "53": { lat: 17.6868, lon: 83.2185, name: "Andhra Pradesh (North Coastal)" },
  "56": { lat: 12.9716, lon: 77.5946, name: "Karnataka (Bangalore / South)" },
  "57": { lat: 12.2958, lon: 76.6394, name: "Karnataka (Mysore / Coastal / Central)" },
  "58": { lat: 15.3647, lon: 75.1240, name: "Karnataka (North)" },
  "59": { lat: 15.8497, lon: 74.4977, name: "Karnataka (Belagavi)" },
  "60": { lat: 13.0827, lon: 80.2707, name: "Tamil Nadu (Chennai / North)" },
  "61": { lat: 10.7870, lon: 79.1378, name: "Tamil Nadu (Central Delta)" },
  "62": { lat: 9.9252, lon: 78.1198, name: "Tamil Nadu (Madurai / South)" },
  "63": { lat: 11.6643, lon: 78.1460, name: "Tamil Nadu (Salem / West)" },
  "64": { lat: 11.0168, lon: 76.9558, name: "Tamil Nadu (Coimbatore)" },
  "67": { lat: 11.2588, lon: 75.7804, name: "Kerala (North)" },
  "68": { lat: 9.9312, lon: 76.2673, name: "Kerala (Central)" },
  "69": { lat: 8.5241, lon: 76.9366, name: "Kerala (South)" },
  "70": { lat: 22.5726, lon: 88.3639, name: "West Bengal (Kolkata)" },
  "71": { lat: 22.5958, lon: 88.2636, name: "West Bengal (Howrah)" },
  "72": { lat: 22.4257, lon: 87.3199, name: "West Bengal (Midnapore)" },
  "73": { lat: 26.7271, lon: 88.3953, name: "West Bengal (North)" },
  "74": { lat: 22.7210, lon: 88.4810, name: "West Bengal (24 Parganas)" },
  "75": { lat: 20.2961, lon: 85.8245, name: "Odisha (Bhubaneswar)" },
  "76": { lat: 21.4669, lon: 83.9812, name: "Odisha (West / South)" },
  "77": { lat: 18.8135, lon: 82.7131, name: "Odisha (South)" },
  "78": { lat: 26.1445, lon: 91.7362, name: "Assam" },
  "79": { lat: 25.5788, lon: 91.8933, name: "North-Eastern States" },
  "80": { lat: 25.5941, lon: 85.1376, name: "Bihar (Patna / Central)" },
  "81": { lat: 24.7955, lon: 85.0002, name: "Bihar (Gaya / South)" },
  "82": { lat: 23.7957, lon: 86.4304, name: "Jharkhand (Dhanbad / Bokaro)" },
  "83": { lat: 23.3441, lon: 85.3096, name: "Jharkhand (Ranchi / Jamshedpur)" },
  "84": { lat: 26.1542, lon: 85.8918, name: "Bihar (North)" },
  "85": { lat: 25.7796, lon: 87.4753, name: "Bihar (East)" }
};

// State / UT centroids fallback
const STATE_COORDINATES = {
  karnataka: { lat: 14.5204, lon: 75.7224 },
  "tamil nadu": { lat: 11.1271, lon: 78.6569 },
  kerala: { lat: 10.8505, lon: 76.2711 },
  "andhra pradesh": { lat: 15.9129, lon: 79.7400 },
  telangana: { lat: 17.8749, lon: 78.1008 },
  goa: { lat: 15.2993, lon: 74.1240 },
  maharashtra: { lat: 19.7515, lon: 75.7139 },
  gujarat: { lat: 22.2587, lon: 71.1924 },
  "madhya pradesh": { lat: 22.9734, lon: 78.6569 },
  chhattisgarh: { lat: 21.2787, lon: 81.8661 },
  odisha: { lat: 20.9517, lon: 85.0985 },
  rajasthan: { lat: 27.0238, lon: 74.2179 },
  "uttar pradesh": { lat: 26.8467, lon: 80.9462 },
  uttarakhand: { lat: 30.0668, lon: 79.0193 },
  delhi: { lat: 28.7041, lon: 77.1025 },
  haryana: { lat: 29.0588, lon: 76.0856 },
  punjab: { lat: 31.1471, lon: 75.3412 },
  chandigarh: { lat: 30.7333, lon: 76.7794 },
  "himachal pradesh": { lat: 31.1048, lon: 77.1734 },
  "jammu and kashmir": { lat: 33.7782, lon: 76.5762 },
  ladakh: { lat: 34.1526, lon: 77.5771 },
  "west bengal": { lat: 22.9868, lon: 87.8550 },
  bihar: { lat: 25.0961, lon: 85.3131 },
  jharkhand: { lat: 23.6102, lon: 85.2799 },
  assam: { lat: 26.2006, lon: 92.9376 },
  meghalaya: { lat: 25.4670, lon: 91.3662 },
  tripura: { lat: 23.9408, lon: 91.9882 },
  manipur: { lat: 24.6637, lon: 93.9063 },
  mizoram: { lat: 23.1645, lon: 92.9376 },
  nagaland: { lat: 26.1584, lon: 94.5624 },
  "arunachal pradesh": { lat: 28.2180, lon: 94.7278 },
  sikkim: { lat: 27.5330, lon: 88.5122 },
  "andaman and nicobar islands": { lat: 11.7401, lon: 92.6586 },
  puducherry: { lat: 11.9416, lon: 79.8083 }
};

function resolveCoordinates(location) {
  const directLat = normalizeCoordinate(location?.latitude);
  const directLon = normalizeCoordinate(location?.longitude);
  if (directLat !== null && directLon !== null) {
    return { latitude: directLat, longitude: directLon, source: "gps" };
  }

  const city = String(location?.city || "").trim().toLowerCase();
  const address = String(location?.address || "").trim().toLowerCase();

  // 1. Explicit city check for Mysore / Mysuru
  // Centroid: { lat: 12.2958, lon: 76.6394 } (~120-140 km from Bangalore warehouse)
  // Ensures Mysore is never erroneously mapped to Bangalore's local slab even if user accidentally entered a 560xxx Bangalore PIN
  if (
    city.includes("mysore") ||
    city.includes("mysuru") ||
    (address.includes("mysore") && !address.includes("bangalore") && !address.includes("bengaluru")) ||
    (address.includes("mysuru") && !address.includes("bangalore") && !address.includes("bengaluru"))
  ) {
    return { latitude: 12.2958, longitude: 76.6394, source: "city_mysore" };
  }

  // Other major Karnataka hubs keyword check
  if (city.includes("mangalore") || city.includes("mangaluru")) {
    return { latitude: 12.9141, longitude: 74.8560, source: "city_mangalore" };
  }
  if (city.includes("hubli") || city.includes("dharwad") || city.includes("hubballi")) {
    return { latitude: 15.3647, longitude: 75.1240, source: "city_hubli" };
  }
  if (city.includes("belgaum") || city.includes("belagavi")) {
    return { latitude: 15.8497, longitude: 74.4977, source: "city_belagavi" };
  }

  // 2. PIN code matching (3-digit sorting district or 2-digit circle)
  const pin = String(location?.pincode || location?.postalCode || "").trim().replace(/\D/g, "");
  if (pin.length >= 3) {
    const p3 = pin.slice(0, 3);
    if (PINCODE_PREFIX_COORDINATES[p3]) {
      return { latitude: PINCODE_PREFIX_COORDINATES[p3].lat, longitude: PINCODE_PREFIX_COORDINATES[p3].lon, source: "pincode3" };
    }
  }
  if (pin.length >= 2) {
    const p2 = pin.slice(0, 2);
    if (PINCODE_2DIGIT_COORDINATES[p2]) {
      return { latitude: PINCODE_2DIGIT_COORDINATES[p2].lat, longitude: PINCODE_2DIGIT_COORDINATES[p2].lon, source: "pincode2" };
    }
  }

  // 3. City keyword check for major hubs (e.g. Bangalore)
  if (city.includes("bangalore") || city.includes("bengaluru") || address.includes("bangalore") || address.includes("bengaluru")) {
    return { latitude: 12.9716, longitude: 77.5946, source: "city_bangalore" };
  }

  // 4. State lookup
  const state = String(location?.state || "").trim().toLowerCase();
  if (state && STATE_COORDINATES[state]) {
    if (state === "karnataka" && (city.includes("bangalore") || city.includes("bengaluru") || !city)) {
      return { latitude: 12.9716, longitude: 77.5946, source: "state_karnataka_bangalore" };
    }
    return { latitude: STATE_COORDINATES[state].lat, longitude: STATE_COORDINATES[state].lon, source: "state" };
  }

  return null;
}

function normalizeWarehouseLocation(input) {
  const resolved = resolveCoordinates(input);
  return {
    name: String(input?.name || "").trim(),
    address: String(input?.address || "").trim(),
    latitude: resolved ? resolved.latitude : 12.959905555555553,
    longitude: resolved ? resolved.longitude : 77.51124777777775
  };
}

function normalizeDistancePricing(input, fallbackDeliveryCharge = 0) {
  const rawMax = normalizeCoordinate(input?.maxCharge);
  return {
    enabled: input?.enabled !== false,
    baseFee: Math.max(0, Number(input?.baseFee ?? fallbackDeliveryCharge ?? 0)),
    perKmCharge: Math.max(0, Number(input?.perKmCharge || 0)),
    freeRadiusKm: Math.max(0, Number(input?.freeRadiusKm || 0)),
    maxCharge: rawMax === null ? null : Math.max(0, rawMax)
  };
}

const COUNTRY_ALIASES = {
  in: "india",
  ind: "india",
  india: "india",
  bharat: "india",
  hindustan: "india",
  us: "united states",
  usa: "united states",
  "u.s.a": "united states",
  "u.s": "united states",
  "u s a": "united states",
  "u s": "united states",
  america: "united states",
  "united states": "united states",
  "united states of america": "united states",
  gb: "united kingdom",
  uk: "united kingdom",
  "u.k": "united kingdom",
  "u k": "united kingdom",
  "great britain": "united kingdom",
  britain: "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "united kingdom": "united kingdom",
  "northern ireland": "united kingdom",
  ca: "canada",
  can: "canada",
  canada: "canada",
  au: "australia",
  aus: "australia",
  australia: "australia",
  nz: "new zealand",
  "new zealand": "new zealand",
  ae: "united arab emirates",
  uae: "united arab emirates",
  "u.a.e": "united arab emirates",
  "u a e": "united arab emirates",
  "united arab emirates": "united arab emirates",
  dubai: "united arab emirates",
  "abu dhabi": "united arab emirates",
  de: "germany",
  germany: "germany",
  deutschland: "germany",
  fr: "france",
  france: "france",
  sg: "singapore",
  singapore: "singapore",
  my: "malaysia",
  malaysia: "malaysia",
  sa: "saudi arabia",
  ksa: "saudi arabia",
  "saudi arabia": "saudi arabia",
  qa: "qatar",
  qatar: "qatar",
  kw: "kuwait",
  kuwait: "kuwait",
  om: "oman",
  oman: "oman",
  bh: "bahrain",
  bahrain: "bahrain",
  ch: "switzerland",
  switzerland: "switzerland",
  nl: "netherlands",
  netherlands: "netherlands",
  holland: "netherlands",
  ie: "ireland",
  ireland: "ireland",
  jp: "japan",
  japan: "japan",
  za: "south africa",
  "south africa": "south africa"
};

function normalizeCountryName(country) {
  const compact = String(country || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

  return COUNTRY_ALIASES[compact] || compact;
}

function normalizeInternationalDelivery(input, fallbackDeliveryCharge = 0) {
  const rawRates = Array.isArray(input?.countryRates) ? input.countryRates : [];
  const seen = new Set();
  const countryRates = rawRates.reduce((acc, item) => {
    const country = String(item?.country || "").trim();
    const key = normalizeCountryName(country);
    if (!country || seen.has(key)) {
      return acc;
    }

    seen.add(key);
    acc.push({
      country,
      fee: Math.max(0, Number(item?.fee ?? 0))
    });
    return acc;
  }, []);

  return {
    enabled: input?.enabled === true,
    domesticCountry: String(input?.domesticCountry || "India").trim() || "India",
    defaultFee: Math.max(0, Number(input?.defaultFee ?? fallbackDeliveryCharge ?? 0)),
    countryRates
  };
}

function calculateDistanceKm(from, to) {
  const coord1 = resolveCoordinates(from);
  const coord2 = resolveCoordinates(to);

  if (!coord1 || !coord2) {
    return null;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.latitude)) * Math.cos(toRad(coord2.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusKm * c * 10) / 10;
}

function isDigitalItem(item) {
  if (!item) return false;
  if (item.isDigital === true || item.product?.isDigital === true) return true;

  const format = String(
    item.format || item.selectedFormat || item.variant || item.binding || item.product?.format || ""
  ).trim().toLowerCase();

  const category = String(
    item.category || item.product?.category || ""
  ).trim().toLowerCase();

  const name = String(
    item.name || item.product?.name || item.title || ""
  ).trim().toLowerCase();

  const digitalKeywords = [
    "ebook",
    "e-book",
    "kindle",
    "web version",
    "web-version",
    "webversion",
    "digital",
    "flipbook",
    "epub",
    "pdf"
  ];

  return digitalKeywords.some(
    (kw) => format.includes(kw) || category.includes(kw) || name.includes(kw)
  );
}

function calculateIndiaPostCharge(distanceKm, items) {
  // 1. Calculate Total Chargeable Weight of the physical cart items
  let totalWeightGrams = 0;
  
  if (Array.isArray(items)) {
    items.forEach((item) => {
      if (isDigitalItem(item)) return; // Digital items contribute zero shipping weight
      const qty = Math.max(1, Number(item?.quantity || 1));
      const actualWeight = Number(item?.weight || item?.product?.weight || 0); // weight in grams
      const l = Number(item?.length || item?.product?.length || 0); // in cm
      const w = Number(item?.width || item?.product?.width || 0); // in cm
      const h = Number(item?.height || item?.product?.height || 0); // in cm
      
      const volumetricWeightKg = (l * w * h) / 5000;
      const volumetricWeightGrams = volumetricWeightKg * 1000;
      
      const itemChargeableWeightGrams = Math.max(actualWeight, volumetricWeightGrams);
      totalWeightGrams += itemChargeableWeightGrams * qty;
    });
  }
  
  // Default to 250g if no weight is found in the cart (safety fallback)
  if (totalWeightGrams <= 0) {
    totalWeightGrams = 250;
  }
  
  // 2. Map distance to India Post distance slabs
  let zone = "local";
  const dist = distanceKm !== null ? distanceKm : 25; // default to local distance when unknown
  
  if (dist <= 50) {
    zone = "local";
  } else if (dist <= 200) {
    zone = "upTo200";
  } else if (dist <= 500) {
    zone = "upTo500";
  } else if (dist <= 1000) {
    zone = "upTo1000";
  } else if (dist <= 2000) {
    zone = "upTo2000";
  } else {
    zone = "above2000";
  }
  
  // 3. Compute base rate & additional step fees (Speed Post domestic tariff)
  let baseRate = 0;
  
  if (totalWeightGrams <= 50) {
    // Up to 50g
    baseRate = zone === "local" ? 19 : 47;
  } else if (totalWeightGrams <= 250) {
    // 51g - 250g
    const rates = {
      local: 24,
      upTo200: 59,
      upTo500: 63,
      upTo1000: 68,
      upTo2000: 72,
      above2000: 77
    };
    baseRate = rates[zone];
  } else if (totalWeightGrams <= 500) {
    // 251g - 500g
    const rates = {
      local: 28,
      upTo200: 70,
      upTo500: 75,
      upTo1000: 82,
      upTo2000: 86,
      above2000: 93
    };
    baseRate = rates[zone];
  } else {
    // Above 500g
    const initialRates = {
      local: 28,
      upTo200: 70,
      upTo500: 75,
      upTo1000: 82,
      upTo2000: 86,
      above2000: 93
    };
    const initialRate = initialRates[zone];
    
    // Additional charge per 500g (or part thereof)
    const incrementalRates = {
      local: 10,
      upTo200: 15,
      upTo500: 30,
      upTo1000: 30,
      upTo2000: 40,
      above2000: 50
    };
    const incrementalRate = incrementalRates[zone];
    
    const extraWeight = totalWeightGrams - 500;
    const extraSteps = Math.ceil(extraWeight / 500);
    
    baseRate = initialRate + (extraSteps * incrementalRate);
  }
  
  // Apply 18% GST
  const finalRateWithGst = baseRate * 1.18;
  return Math.round(finalRateWithGst * 100) / 100;
}

function getDeliveryPricingDetails(settings, shipping, items) {
  const itemList = Array.isArray(items) ? items : [];

  if (itemList.length > 0) {
    const physicalItems = itemList.filter((item) => !isDigitalItem(item));

    // If ALL items in the cart/order are digital (Web version, Kindle, E-book, PDF, etc.)
    if (physicalItems.length === 0) {
      return {
        deliveryCharge: 0,
        distanceKm: null,
        isDistanceBased: false,
        pricingMode: "digital",
        matchedCountry: "",
        isDigitalOnly: true
      };
    }

    items = physicalItems;
  }

  const fallbackCharge = Math.max(0, Number(settings?.deliveryCharge || 0));
  const warehouseLocation = normalizeWarehouseLocation(settings?.warehouseLocation || {});
  const distancePricing = normalizeDistancePricing(settings?.distancePricing || {}, fallbackCharge);
  const internationalDelivery = normalizeInternationalDelivery(settings?.internationalDelivery || {}, fallbackCharge);
  const shippingCountry = String(shipping?.country || "").trim();
  const normalizedShippingCountry = normalizeCountryName(shippingCountry);
  const normalizedDomesticCountry = normalizeCountryName(internationalDelivery.domesticCountry);

  if (
    internationalDelivery.enabled &&
    normalizedShippingCountry &&
    normalizedShippingCountry !== normalizedDomesticCountry
  ) {
    const matchedRate = internationalDelivery.countryRates.find(
      (item) => normalizeCountryName(item.country) === normalizedShippingCountry
    );
    const internationalFee = matchedRate ? matchedRate.fee : internationalDelivery.defaultFee;
    return {
      deliveryCharge: Math.round(Math.max(0, Number(internationalFee || 0)) * 100) / 100,
      distanceKm: null,
      isDistanceBased: false,
      pricingMode: "international",
      matchedCountry: matchedRate?.country || shippingCountry || ""
    };
  }

  const distanceKm = calculateDistanceKm(warehouseLocation, shipping);

  // If distance-based pricing is enabled, run the standard distance-based calculation
  if (distancePricing.enabled && distanceKm !== null) {
    const chargeableDistance = Math.max(0, distanceKm - distancePricing.freeRadiusKm);
    let deliveryCharge = distancePricing.baseFee + chargeableDistance * distancePricing.perKmCharge;

    if (distancePricing.maxCharge !== null) {
      deliveryCharge = Math.min(deliveryCharge, distancePricing.maxCharge);
    }

    return {
      deliveryCharge: Math.round(Math.max(0, deliveryCharge) * 100) / 100,
      distanceKm,
      isDistanceBased: true,
      pricingMode: "distance",
      matchedCountry: ""
    };
  }

  // Fallback / India Post calculation when distance pricing is disabled
  const indiaPostFee = calculateIndiaPostCharge(distanceKm, items);
  return {
    deliveryCharge: indiaPostFee,
    distanceKm,
    isDistanceBased: false,
    pricingMode: "indiapost",
    matchedCountry: ""
  };
}

function resolveDeliveryCharge(settings, shipping, items) {
  return getDeliveryPricingDetails(settings, shipping, items).deliveryCharge;
}

module.exports = {
  normalizeCoordinate,
  resolveCoordinates,
  normalizeWarehouseLocation,
  normalizeDistancePricing,
  normalizeInternationalDelivery,
  normalizeCountryName,
  COUNTRY_ALIASES,
  calculateDistanceKm,
  calculateIndiaPostCharge,
  getDeliveryPricingDetails,
  resolveDeliveryCharge,
  isDigitalItem,
  PINCODE_PREFIX_COORDINATES,
  PINCODE_2DIGIT_COORDINATES,
  STATE_COORDINATES
};
