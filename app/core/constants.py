STATE_NAMES = {
    "JH": {"name": "Jharkhand", "name_hi": "झारखंड", "name_bn": "ঝাড়খণ্ড", "priority": True},
    "WB": {"name": "West Bengal", "name_hi": "पश्चिम बंगाल", "name_bn": "পশ্চিমবঙ্গ", "priority": False},
    "BR": {"name": "Bihar", "name_hi": "बिहार", "name_bn": "বিহার", "priority": False},
}
SOURCE_TYPES = ["handpump", "borewell", "dugwell", "river", "pond", "mine_water", "piped", "tanker", "other"]
SCENARIOS = ["clean_water", "high_tds_mine_water", "high_turbidity_after_rain", "acidic_mine_drainage", "alkaline_water", "noisy_sensor", "stuck_sensor", "sensor_dropout", "device_silent", "disconnect", "no_hello_on_boot"]
STATUSES = ["CREATED", "SENSING", "MEASURED", "FILTERING", "COMPLETED", "FAILED", "CANCELLED"]
THRESHOLDS_VERSION = "BIS-IS-10500-2012"
THRESHOLDS = {"ph": {"ok_min": 6.5, "ok_max": 8.5}, "turbidity": {"ok_max": 1.0, "warn_max": 5.0}, "tds": {"ok_max": 500.0, "warn_max": 2000.0}, "fluoride": {"ok_max": 1.0, "warn_max": 1.5}, "arsenic": {"ok_max": 0.01, "warn_max": 0.05}, "iron": {"ok_max": 0.3, "warn_max": 1.0}, "nitrate": {"bad_above": 45.0}}
PLAUSIBLE = {"ph": (0, 14), "tds_mgl": (0, 10000), "turbidity_ntu": (0, 4000), "temp_c": (-5, 80)}
