// ============ 配置信息 ============
const productId = "YSrJ9TY9w1";
const deviceName = "SmartOutlet";
// 更新后的OneNET安全鉴权信息
const authToken = "version=2022-05-01&res=userid%2F491619&et=2132888183&method=sha1&sign=3JAzFxRYL1vZHg07BHFrQTp0blc%3D";
const API_BASE = "https://iot-api.heclouds.com";

// ============ 性能优化常量 ============
const MAX_FETCH_POINTS = 1000000;      // 最多获取5000个原始点（防止无限循环）

// 设备状态
let socketState = false;          // 插座开关状态
let autoPriceState = false;       // 自动模式状态
let lowPowerState = false;        // 新增省电开关状态
let currentTimeRange = 1;         // 当前时间范围（天）：1=24小时，7=7天
let currentHistoryAttr = 'voltage'; // 当前查询的属性标识符

// DOM 元素缓存
const sensorElements = {
    voltage: document.getElementById('voltage'),
    current: document.getElementById('current'),
    power: document.getElementById('power'),
    tem: document.getElementById('tem'),
    humi: document.getElementById('humi'),
    total_energy: document.getElementById('total_energy')
};

// 阈值控制元素
const thresholdElements = {
    voltageMax: {
        slider: document.getElementById('voltageMaxSlider'),
        input: document.getElementById('voltageMaxInput'),
        display: document.getElementById('voltageMaxDisplay'),
        setBtn: document.getElementById('voltageMaxSetBtn')
    },
    currentMax: {
        slider: document.getElementById('currentMaxSlider'),
        input: document.getElementById('currentMaxInput'),
        display: document.getElementById('currentMaxDisplay'),
        setBtn: document.getElementById('currentMaxSetBtn')
    },
    powerMax: {
        slider: document.getElementById('powerMaxSlider'),
        input: document.getElementById('powerMaxInput'),
        display: document.getElementById('powerMaxDisplay'),
        setBtn: document.getElementById('powerMaxSetBtn')
    },
    currentPrice: {
        slider: document.getElementById('currentPriceSlider'),
        input: document.getElementById('currentPriceInput'),
        display: document.getElementById('currentPriceDisplay'),
        setBtn: document.getElementById('currentPriceSetBtn')
    },
    priceThreshold: {
        slider: document.getElementById('priceThresholdSlider'),
        input: document.getElementById('priceThresholdInput'),
        display: document.getElementById('priceThresholdDisplay'),
        setBtn: document.getElementById('priceThresholdSetBtn')
    },
    // 新增低功率阈值
    powerLowThreshold: {
        slider: document.getElementById('powerLowThresholdSlider'),
        input: document.getElementById('powerLowThresholdInput'),
        display: document.getElementById('powerLowThresholdDisplay'),
        setBtn: document.getElementById('powerLowThresholdSetBtn')
    },
    // 新增低功率持续时间
    lowPowerDuration: {
        slider: document.getElementById('lowPowerDurationSlider'),
        input: document.getElementById('lowPowerDurationInput'),
        display: document.getElementById('lowPowerDurationDisplay'),
        setBtn: document.getElementById('lowPowerDurationSetBtn')
    }
};

// 开关按钮
const switchBtn = document.getElementById('socketSwitch');
const autoPriceBtn = document.getElementById('autoPriceSwitch');
const lowPowerBtn = document.getElementById('lowPowerSwitch'); // 新增省电开关按钮

// 历史数据相关元素
const historyAttrBtns = document.querySelectorAll('.history-attr-btn');
const historyTimeBtns = document.querySelectorAll('.history-time-btn');
const historyChartDiv = document.getElementById('historyChart');
const historyLoading = document.getElementById('historyLoading');
const peakValueSpan = document.getElementById('peakValue');
const peakUnitSpan = document.getElementById('peakUnit');
const peakTimeSpan = document.getElementById('peakTime');

// 自定义时间输入框
const startTimeInput = document.getElementById('startTimeInput');
const endTimeInput = document.getElementById('endTimeInput');

// 错误提示元素
const errorDiv = document.getElementById('errorMsg');

// 图表实例
let historyChart = null;

// 更新当前时间
function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('currentTime').textContent = timeStr;
    
    // 默认填充当前时间的前24小时作为初始值
    if (!startTimeInput.value) {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        startTimeInput.value = yesterday.toISOString().slice(0, 16);
    }
    if (!endTimeInput.value) {
        endTimeInput.value = now.toISOString().slice(0, 16);
    }
}

// ============ 工具函数 ============
/**
 * 显示错误提示
 * @param {string} msg 错误信息
 */
function showError(msg) {
    errorDiv.style.display = 'block';
    errorDiv.innerText = `❌ ${msg}`;
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

/**
 * 延时函数
 * @param {number} ms 延时毫秒数
 * @returns {Promise}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 计算时间范围（快捷按钮用）
 * @param {number} days 天数（1=24小时，7=7天）
 * @returns {object} 包含start和end时间戳的对象
 */
function getTimeRange(days) {
    const now = Date.now(); // 当前时间戳（毫秒）
    const end = now;
    const start = now - days * 86400000; 
    return { start, end };
}

/**
 * 将datetime-local格式转换为时间戳（毫秒）
 * @param {string} datetimeStr datetime-local格式字符串
 * @returns {number} 时间戳（毫秒）
 */
function datetimeToTimestamp(datetimeStr) {
    if (!datetimeStr) return 0;
    // 转换为UTC时间戳（毫秒）
    return new Date(datetimeStr).getTime();
}

/**
 * 获取属性单位
 * @param {string} identifier 属性标识符
 * @returns {string} 单位字符串
 */
function getUnit(identifier) {
    const unitMap = {
        voltage: 'V',
        current: 'mA',
        power: 'W',
        tem: '°C',
        humi: '%RH',
        total_energy: 'kWh',
        current_max: 'mA',
        voltage_max: 'V',
        power_max: 'W',
        current_price: '元',
        price_threshold: '元',
        power_low_threshold: 'W',      // 新增
        low_power_duration: '秒',       // 新增
        socket: '',
        auto_price_enable: '',
        low_power_enable: ''            // 新增
    };
    return unitMap[identifier] || '';
}

/**
 * 格式化枚举值显示
 * @param {string|number} value 值
 * @param {string} identifier 属性标识符
 * @returns {string} 格式化后的显示文本
 */
function formatEnumValue(value, identifier) {
    if (identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable') {
        return value == 1 ? '开' : '关';
    }
    return value;
}

// ============ 阈值同步函数 ============
function syncVoltageMaxFromSlider() {
    const val = parseFloat(thresholdElements.voltageMax.slider.value);
    thresholdElements.voltageMax.input.value = val;
    thresholdElements.voltageMax.display.innerText = val.toFixed(1);
}

function syncVoltageMaxFromInput() {
    let val = parseFloat(thresholdElements.voltageMax.input.value);
    if (isNaN(val)) val = 0;
    val = Math.min(500, Math.max(0, val));
    thresholdElements.voltageMax.input.value = val;
    thresholdElements.voltageMax.display.innerText = val.toFixed(1);
    thresholdElements.voltageMax.slider.value = val;
}

function syncCurrentMaxFromSlider() {
    const val = parseInt(thresholdElements.currentMax.slider.value);
    thresholdElements.currentMax.input.value = val;
    thresholdElements.currentMax.display.innerText = val;
}

function syncCurrentMaxFromInput() {
    let val = parseInt(thresholdElements.currentMax.input.value);
    if (isNaN(val)) val = 0;
    val = Math.min(50000, Math.max(0, val));
    thresholdElements.currentMax.input.value = val;
    thresholdElements.currentMax.display.innerText = val;
    thresholdElements.currentMax.slider.value = val;
}

function syncPowerMaxFromSlider() {
    const val = parseFloat(thresholdElements.powerMax.slider.value);
    thresholdElements.powerMax.input.value = val;
    thresholdElements.powerMax.display.innerText = val.toFixed(1);
}

function syncPowerMaxFromInput() {
    let val = parseFloat(thresholdElements.powerMax.input.value);
    if (isNaN(val)) val = 0;
    val = Math.min(5000, Math.max(0, val));
    thresholdElements.powerMax.input.value = val;
    thresholdElements.powerMax.display.innerText = val.toFixed(1);
    thresholdElements.powerMax.slider.value = val;
}

function syncCurrentPriceFromSlider() {
    const val = parseFloat(thresholdElements.currentPrice.slider.value);
    thresholdElements.currentPrice.input.value = val;
    thresholdElements.currentPrice.display.innerText = val.toFixed(2);
}

function syncCurrentPriceFromInput() {
    let val = parseFloat(thresholdElements.currentPrice.input.value);
    if (isNaN(val)) val = 0;
    val = Math.min(10, Math.max(0, val));
    thresholdElements.currentPrice.input.value = val;
    thresholdElements.currentPrice.display.innerText = val.toFixed(2);
    thresholdElements.currentPrice.slider.value = val;
}

function syncPriceThresholdFromSlider() {
    const val = parseFloat(thresholdElements.priceThreshold.slider.value);
    thresholdElements.priceThreshold.input.value = val;
    thresholdElements.priceThreshold.display.innerText = val.toFixed(2);
}

function syncPriceThresholdFromInput() {
    let val = parseFloat(thresholdElements.priceThreshold.input.value);
    if (isNaN(val)) val = 0;
    val = Math.min(10, Math.max(0, val));
    thresholdElements.priceThreshold.input.value = val;
    thresholdElements.priceThreshold.display.innerText = val.toFixed(2);
    thresholdElements.priceThreshold.slider.value = val;
}

// 新增低功率阈值同步
function syncPowerLowThresholdFromSlider() {
    const val = parseFloat(thresholdElements.powerLowThreshold.slider.value);
    thresholdElements.powerLowThreshold.input.value = val;
    thresholdElements.powerLowThreshold.display.innerText = val.toFixed(1);
}

function syncPowerLowThresholdFromInput() {
    let val = parseFloat(thresholdElements.powerLowThreshold.input.value);
    if (isNaN(val)) val = 1;
    val = Math.min(2000, Math.max(1, val));
    thresholdElements.powerLowThreshold.input.value = val;
    thresholdElements.powerLowThreshold.display.innerText = val.toFixed(1);
    thresholdElements.powerLowThreshold.slider.value = val;
}

// 新增低功率持续时间同步
function syncLowPowerDurationFromSlider() {
    const val = parseInt(thresholdElements.lowPowerDuration.slider.value);
    thresholdElements.lowPowerDuration.input.value = val;
    thresholdElements.lowPowerDuration.display.innerText = val;
}

function syncLowPowerDurationFromInput() {
    let val = parseInt(thresholdElements.lowPowerDuration.input.value);
    if (isNaN(val)) val = 1;
    val = Math.min(1200, Math.max(1, val));
    thresholdElements.lowPowerDuration.input.value = val;
    thresholdElements.lowPowerDuration.display.innerText = val;
    thresholdElements.lowPowerDuration.slider.value = val;
}

// ============ 步进按钮函数 ============
function decrementVoltageMax() {
    let currentVal = parseFloat(thresholdElements.voltageMax.slider.value);
    let newVal = Math.max(0, currentVal - 0.1);
    thresholdElements.voltageMax.slider.value = newVal;
    syncVoltageMaxFromSlider();
}

function incrementVoltageMax() {
    let currentVal = parseFloat(thresholdElements.voltageMax.slider.value);
    let newVal = Math.min(500, currentVal + 0.1);
    thresholdElements.voltageMax.slider.value = newVal;
    syncVoltageMaxFromSlider();
}

function decrementCurrentMax() {
    let currentVal = parseInt(thresholdElements.currentMax.slider.value);
    let newVal = Math.max(0, currentVal - 100);
    thresholdElements.currentMax.slider.value = newVal;
    syncCurrentMaxFromSlider();
}

function incrementCurrentMax() {
    let currentVal = parseInt(thresholdElements.currentMax.slider.value);
    let newVal = Math.min(50000, currentVal + 100);
    thresholdElements.currentMax.slider.value = newVal;
    syncCurrentMaxFromSlider();
}

function decrementPowerMax() {
    let currentVal = parseFloat(thresholdElements.powerMax.slider.value);
    let newVal = Math.max(0, currentVal - 1);
    thresholdElements.powerMax.slider.value = newVal;
    syncPowerMaxFromSlider();
}

function incrementPowerMax() {
    let currentVal = parseFloat(thresholdElements.powerMax.slider.value);
    let newVal = Math.min(5000, currentVal + 1);
    thresholdElements.powerMax.slider.value = newVal;
    syncPowerMaxFromSlider();
}

function decrementCurrentPrice() {
    let currentVal = parseFloat(thresholdElements.currentPrice.slider.value);
    let newVal = Math.max(0, currentVal - 0.01);
    thresholdElements.currentPrice.slider.value = newVal;
    syncCurrentPriceFromSlider();
}

function incrementCurrentPrice() {
    let currentVal = parseFloat(thresholdElements.currentPrice.slider.value);
    let newVal = Math.min(10, currentVal + 0.01);
    thresholdElements.currentPrice.slider.value = newVal;
    syncCurrentPriceFromSlider();
}

function decrementPriceThreshold() {
    let currentVal = parseFloat(thresholdElements.priceThreshold.slider.value);
    let newVal = Math.max(0, currentVal - 0.01);
    thresholdElements.priceThreshold.slider.value = newVal;
    syncPriceThresholdFromSlider();
}

function incrementPriceThreshold() {
    let currentVal = parseFloat(thresholdElements.priceThreshold.slider.value);
    let newVal = Math.min(10, currentVal + 0.01);
    thresholdElements.priceThreshold.slider.value = newVal;
    syncPriceThresholdFromSlider();
}

// 新增低功率阈值步进
function decrementPowerLowThreshold() {
    let currentVal = parseFloat(thresholdElements.powerLowThreshold.slider.value);
    let newVal = Math.max(1, currentVal - 0.1);
    thresholdElements.powerLowThreshold.slider.value = newVal;
    syncPowerLowThresholdFromSlider();
}

function incrementPowerLowThreshold() {
    let currentVal = parseFloat(thresholdElements.powerLowThreshold.slider.value);
    let newVal = Math.min(2000, currentVal + 0.1);
    thresholdElements.powerLowThreshold.slider.value = newVal;
    syncPowerLowThresholdFromSlider();
}

// 新增低功率持续时间步进
function decrementLowPowerDuration() {
    let currentVal = parseInt(thresholdElements.lowPowerDuration.slider.value);
    let newVal = Math.max(1, currentVal - 1);
    thresholdElements.lowPowerDuration.slider.value = newVal;
    syncLowPowerDurationFromSlider();
}

function incrementLowPowerDuration() {
    let currentVal = parseInt(thresholdElements.lowPowerDuration.slider.value);
    let newVal = Math.min(1200, currentVal + 1);
    thresholdElements.lowPowerDuration.slider.value = newVal;
    syncLowPowerDurationFromSlider();
}

// ============ API 请求函数 ============
/**
 * 获取设备实时属性
 */
function fetchDeviceData() {
    const url = `${API_BASE}/thingmodel/query-device-property?product_id=${productId}&device_name=${deviceName}`;
    
    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.code !== 0) {
            throw new Error(data.msg || '获取设备数据失败');
        }
        
        const props = data.data || [];
        const propMap = {};
        
        // 构建属性映射
        props.forEach(item => {
            propMap[item.identifier] = item.value;
        });
        
        // 更新实时数据显示
        Object.keys(sensorElements).forEach(key => {
            if (propMap[key] !== undefined) {
                let value = propMap[key];
                // 根据属性类型格式化显示
                if (key === 'tem' || key === 'humi') {
                    value = parseInt(value);
                } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
                    value = parseFloat(value).toFixed(1);
                }
                sensorElements[key].innerText = value;
            }
        });
        
        // 更新开关状态
        if (propMap.socket !== undefined) {
            socketState = propMap.socket == 1;
            switchBtn.classList.toggle('on', socketState);
        }
        
        // 更新自动模式状态
        if (propMap.auto_price_enable !== undefined) {
            autoPriceState = propMap.auto_price_enable == 1;
            autoPriceBtn.classList.toggle('on', autoPriceState);
        }

        // 更新省电开关状态
        if (propMap.low_power_enable !== undefined) {
            lowPowerState = propMap.low_power_enable == 1;
            lowPowerBtn.classList.toggle('on', lowPowerState);
        }
        
        // 更新阈值显示
        if (propMap.voltage_max !== undefined) {
            const val = parseFloat(propMap.voltage_max);
            thresholdElements.voltageMax.display.innerText = val.toFixed(1);
            thresholdElements.voltageMax.input.value = val;
            thresholdElements.voltageMax.slider.value = val;
        }
        
        if (propMap.current_max !== undefined) {
            const val = parseInt(propMap.current_max);
            thresholdElements.currentMax.display.innerText = val;
            thresholdElements.currentMax.input.value = val;
            thresholdElements.currentMax.slider.value = val;
        }
        
        if (propMap.power_max !== undefined) {
            const val = parseFloat(propMap.power_max);
            thresholdElements.powerMax.display.innerText = val.toFixed(1);
            thresholdElements.powerMax.input.value = val;
            thresholdElements.powerMax.slider.value = val;
        }
        
        if (propMap.current_price !== undefined) {
            const val = parseFloat(propMap.current_price);
            thresholdElements.currentPrice.display.innerText = val.toFixed(2);
            thresholdElements.currentPrice.input.value = val;
            thresholdElements.currentPrice.slider.value = val;
        }
        
        if (propMap.price_threshold !== undefined) {
            const val = parseFloat(propMap.price_threshold);
            thresholdElements.priceThreshold.display.innerText = val.toFixed(2);
            thresholdElements.priceThreshold.input.value = val;
            thresholdElements.priceThreshold.slider.value = val;
        }

        // 新增：低功率阈值
        if (propMap.power_low_threshold !== undefined) {
            const val = parseFloat(propMap.power_low_threshold);
            thresholdElements.powerLowThreshold.display.innerText = val.toFixed(1);
            thresholdElements.powerLowThreshold.input.value = val;
            thresholdElements.powerLowThreshold.slider.value = val;
        }

        // 新增：低功率持续时间
        if (propMap.low_power_duration !== undefined) {
            const val = parseInt(propMap.low_power_duration);
            thresholdElements.lowPowerDuration.display.innerText = val;
            thresholdElements.lowPowerDuration.input.value = val;
            thresholdElements.lowPowerDuration.slider.value = val;
        }
    })
    .catch(error => {
        console.error('获取设备数据失败:', error);
        showError(error.message);
    });
}

/**
 * 设置设备属性
 * @param {object} params 属性参数
 * @param {HTMLElement} btn 操作按钮
 */
function sendCommand(params, btn) {
    const url = `${API_BASE}/thingmodel/set-device-desired-property`;
    
    if (btn) btn.disabled = true;
    
    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            product_id: productId,
            device_name: deviceName,
            params: params
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.code !== 0) {
            throw new Error(data.msg || '设置属性失败');
        }
        
        // 延迟刷新数据
        setTimeout(() => {
            fetchDeviceData();
            if (btn) btn.disabled = false;
        }, 1000);
    })
    .catch(error => {
        console.error('设置属性失败:', error);
        showError(error.message);
        if (btn) btn.disabled = false;
    });
}

/**
 * 查询设备属性历史数据（循环换页版，带数量限制）
 * @param {string} identifier 属性标识符
 * @param {number} start 起始时间戳（毫秒）
 * @param {number} end 结束时间戳（毫秒）
 * @returns {Promise<Array>} 历史数据数组
 */
async function fetchHistoryData(identifier, start, end) {
    let allData = [];
    let offset = 0;
    const limit = 2000;
    const now = Date.now(); // 当前时间戳
    
    try {
        while (true) {
            // 核心参数：固定2000条、正序排列
            const params = new URLSearchParams({
                product_id: productId,
                device_name: deviceName,
                identifier: identifier,
                start_time: start.toString(),
                end_time: end.toString(),
                limit: limit.toString(),     
                offset: offset.toString(),     
                sort: '1'        
            });

            const url = `${API_BASE}/thingmodel/query-device-property-history?${params}`;
            
            // 超时控制（5秒）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': authToken,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const result = await response.json();
            
            if (result.code !== 0) {
                throw new Error(result.msg || '历史数据获取失败');
            }
            
            // 格式化数据
            const list = result.data?.list || [];
            if (list.length === 0) {
                break; // 没有更多数据，退出循环
            }
            
            const formattedData = list.map(item => ({
                time: item.time,
                value: item.identifier === 'socket' || item.identifier === 'auto_price_enable' || item.identifier === 'low_power_enable'
                    ? parseInt(item.value) 
                    : parseFloat(item.value) || 0
            }));
            
            // 合并数据
            allData = allData.concat(formattedData);
            
            // 新增：数量限制
            if (allData.length >= MAX_FETCH_POINTS) {
                console.warn(`数据量过大，已截断至${MAX_FETCH_POINTS}条`);
                showError(`数据量过大，仅显示部分数据（最多${MAX_FETCH_POINTS}条）`);
                break;
            }
            
            // 检查最后一条数据的时间是否超过当前时间戳
            const lastDataTime = formattedData[formattedData.length - 1].time;
            if (lastDataTime >= now) {
                break; // 已到达当前时间，退出循环
            }
            
            // 检查是否还有下一页
            if (list.length < limit) {
                break; // 本页数据不足limit条，说明没有下一页
            }
            
            // 换页，延时10ms
            offset += limit;
            await delay(10);
        }

        // 按时间正序排列
        return allData.sort((a, b) => a.time - b.time);

    } catch (error) {
        console.error(`获取${identifier}历史数据失败:`, error);
        showError(`加载${identifier}历史数据失败: ${error.message}`);
        return [];
    }
}

// ============ 开关控制函数 ============
function toggleSocket() {
    if (switchBtn.disabled) return;
    
    switchBtn.disabled = true;
    const newState = !socketState;
    
    sendCommand({ socket: newState ? 1 : 0 }, switchBtn);
}

function toggleAutoPrice() {
    if (autoPriceBtn.disabled) return;
    
    autoPriceBtn.disabled = true;
    const newState = !autoPriceState;
    
    sendCommand({ auto_price_enable: newState ? 1 : 0 }, autoPriceBtn);
}

// 新增省电开关控制
function toggleLowPower() {
    if (lowPowerBtn.disabled) return;
    
    lowPowerBtn.disabled = true;
    const newState = !lowPowerState;
    
    sendCommand({ low_power_enable: newState ? 1 : 0 }, lowPowerBtn);
}

// ============ 阈值设置函数 ============
function setVoltageMax() {
    const val = parseFloat(thresholdElements.voltageMax.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ voltage_max: val }, thresholdElements.voltageMax.setBtn);
}

function setCurrentMax() {
    const val = parseInt(thresholdElements.currentMax.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ current_max: val }, thresholdElements.currentMax.setBtn);
}

function setPowerMax() {
    const val = parseFloat(thresholdElements.powerMax.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ power_max: val }, thresholdElements.powerMax.setBtn);
}

function setCurrentPrice() {
    const val = parseFloat(thresholdElements.currentPrice.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ current_price: val }, thresholdElements.currentPrice.setBtn);
}

function setPriceThreshold() {
    const val = parseFloat(thresholdElements.priceThreshold.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ price_threshold: val }, thresholdElements.priceThreshold.setBtn);
}

// 新增低功率阈值设置
function setPowerLowThreshold() {
    const val = parseFloat(thresholdElements.powerLowThreshold.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ power_low_threshold: val }, thresholdElements.powerLowThreshold.setBtn);
}

// 新增低功率持续时间设置
function setLowPowerDuration() {
    const val = parseInt(thresholdElements.lowPowerDuration.input.value);
    if (isNaN(val)) return;
    
    sendCommand({ low_power_duration: val }, thresholdElements.lowPowerDuration.setBtn);
}

// ============ 历史数据展示函数 ============
/**
 * 更新峰值信息
 * @param {Array} data 数据数组
 * @param {string} identifier 属性标识符
 */
function updatePeakInfo(data, identifier) {
    if (!data || data.length === 0) {
        peakValueSpan.innerText = '--';
        peakUnitSpan.innerText = '';
        peakTimeSpan.innerText = '--';
        return;
    }

    // 开关类数据处理
    if (identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable') {
        const onCount = data.filter(item => item.value === 1).length;
        const offCount = data.length - onCount;
        
        peakValueSpan.innerText = `开:${onCount}次/关:${offCount}次`;
        peakUnitSpan.innerText = '';
        
        // 最后一次状态变化时间
        const lastChange = data[data.length - 1];
        const d = new Date(lastChange.time);
        const timeStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        
        peakTimeSpan.innerText = `最后状态:${formatEnumValue(lastChange.value, identifier)} ${timeStr}`;
        return;
    }

    // 数值型数据找最大值
    let maxValue = -Infinity;
    let maxTime = data[0].time;
    
    for (let point of data) {
        if (point.value > maxValue) {
            maxValue = point.value;
            maxTime = point.time;
        }
    }

    const unit = getUnit(identifier);
    const d = new Date(maxTime);
    const timeStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;

    peakValueSpan.innerText = maxValue.toFixed(2);
    peakUnitSpan.innerText = unit;
    peakTimeSpan.innerText = timeStr;
}

/**
 * 按时间间隔聚合数据（取每个间隔内的最后一个值）
 * @param {Array} data 原始数据（已按时间正序）
 * @param {string} identifier 属性标识符（开关量不聚合）
 * @param {number} intervalMs 聚合间隔（毫秒）
 * @returns {Array} 聚合后的数据
 */
function aggregateDataByTime(data, identifier, intervalMs) {
    // 开关量不聚合，直接返回
    if (identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable') {
        return data;
    }

    if (data.length === 0) return [];

    const bucketMap = new Map(); // 键为桶起始时间戳，值为该桶最后一个数据点

    for (const point of data) {
        // 计算该点所属的桶起始时间（向下取整到间隔）
        const bucketStart = Math.floor(point.time / intervalMs) * intervalMs;
        bucketMap.set(bucketStart, point); // 直接覆盖，保留最后一个值
    }

    // 转换为数组并按时间排序
    const aggregated = Array.from(bucketMap.values());
    return aggregated.sort((a, b) => a.time - b.time);
}

/**
 * 渲染历史数据图表（优化横坐标显示）
 * @param {Array} data 历史数据（已聚合）
 * @param {string} identifier 属性标识符
 * @param {number} days 时间范围（天）
 */
function renderHistoryChart(data, identifier, days = currentTimeRange) {
    if (!historyChart) {
        historyChart = echarts.init(historyChartDiv);
    }

    // 无数据处理
    if (!data || data.length === 0) {
        historyChart.setOption({
            title: { text: '暂无数据', left: 'center', top: 'center' },
            xAxis: { data: [] },
            yAxis: {},
            series: []
        });
        return;
    }

    // 处理X轴时间格式
    const times = data.map(p => {
        const d = new Date(p.time);
        // 根据时间范围选择不同的显示格式
        if (days === 1) {
            // 24小时：只显示整点，格式为"HH:00"
            return `${d.getHours().toString().padStart(2,'0')}:00`;
        } else if (days === 7) {
            // 7天：只显示月日，格式为"MM-DD"
            return `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        } else {
            // 自定义时间：默认格式
            return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        }
    });
    
    // 处理Y轴数据
    const values = data.map(p => p.value);
    const unit = getUnit(identifier);
    
    // 图表配置
    const option = {
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                const value = params[0].value;
                const displayValue = (identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable') 
                    ? formatEnumValue(value, identifier) 
                    : value.toFixed(2);
                
                return `${params[0].axisValue}<br/>数值: ${displayValue} ${unit}`;
            }
        },
        grid: { 
            left: '8%', 
            right: '8%', 
            top: 20, 
            bottom: 40, 
            containLabel: true 
        },
        xAxis: {
            type: 'category',
            data: times,
            axisLabel: { 
                rotate: 45, 
                fontSize: 12,
                interval: 0 
            }
        },
        yAxis: {
            type: identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable' ? 'category' : 'value',
            data: identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable' ? ['关', '开'] : [],
            name: unit,
            nameTextStyle: { fontSize: 12 },
            axisLabel: {
                formatter: function(value) {
                    if (identifier === 'socket' || identifier === 'auto_price_enable' || identifier === 'low_power_enable') {
                        return value == 1 ? '开' : '关';
                    }
                    return value;
                }
            }
        },
        series: [{
            name: identifier,
            type: 'line',
            data: values,
            smooth: identifier !== 'socket' && identifier !== 'auto_price_enable' && identifier !== 'low_power_enable',
            lineStyle: { color: '#3b82f6', width: 2 },
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: true
        }]
    };

    historyChart.setOption(option);
}

/**
 * 加载历史数据（快捷按钮用）
 * @param {string} identifier 属性标识符
 * @param {number} days 天数
 */
async function loadHistoryData(identifier, days = currentTimeRange) {
    historyLoading.style.display = 'block';
    historyLoading.innerText = '加载中...';
    
    if (historyChart) {
        historyChart.clear();
    }

    try {
        const { start, end } = getTimeRange(days);
        console.log(`查询${identifier}(${days}天)：`, new Date(start), '至', new Date(end));
        
        const rawData = await fetchHistoryData(identifier, start, end);
        
        // 先用原始数据更新峰值信息
        updatePeakInfo(rawData, identifier);
        
        // 根据天数决定聚合间隔
        let intervalMs;
        if (days === 1) {
            intervalMs = 60 * 60 * 1000; // 1小时
        } else if (days === 7) {
            intervalMs = 24 * 60 * 60 * 1000; // 1天
        } else {
            // 默认按小时聚合（实际上不会执行到这里，因为days只有1和7）
            intervalMs = 60 * 60 * 1000;
        }
        
        // 聚合数据
        const aggregatedData = aggregateDataByTime(rawData, identifier, intervalMs);
        
        // 渲染图表
        renderHistoryChart(aggregatedData, identifier, days);
        
    } catch (error) {
        console.error('加载历史数据失败:', error);
        showError(`加载${identifier}历史数据失败: ${error.message}`);
    } finally {
        historyLoading.style.display = 'none';
    }
}

/**
 * 自定义时间范围查询历史数据
 */
async function queryCustomTimeData() {
    // 获取输入的时间值
    const startStr = startTimeInput.value;
    const endStr = endTimeInput.value;
    
    // 验证输入
    if (!startStr || !endStr) {
        showError('请选择开始时间和结束时间');
        return;
    }
    
    // 转换为时间戳
    const startTime = datetimeToTimestamp(startStr);
    const endTime = datetimeToTimestamp(endStr);
    
    // 验证时间范围
    if (startTime >= endTime) {
        showError('开始时间不能晚于或等于结束时间');
        return;
    }
    
    // 取消快捷按钮的激活状态
    historyTimeBtns.forEach(btn => btn.classList.remove('active'));
    
    // 加载数据
    historyLoading.style.display = 'block';
    historyLoading.innerText = '加载中...';
    
    if (historyChart) {
        historyChart.clear();
    }

    try {
        console.log(`自定义时间查询：`, new Date(startTime), '至', new Date(endTime));
        const rawData = await fetchHistoryData(currentHistoryAttr, startTime, endTime);
        
        // 先用原始数据更新峰值信息
        updatePeakInfo(rawData, currentHistoryAttr);
        
        // 根据时间跨度决定聚合间隔
        const durationMs = endTime - startTime;
        let intervalMs;
        if (durationMs <= 24 * 60 * 60 * 1000) {
            intervalMs = 60 * 60 * 1000; // ≤24小时 → 按小时
        } else {
            intervalMs = 24 * 60 * 60 * 1000; // 否则按天
        }
        
        // 聚合数据
        const aggregatedData = aggregateDataByTime(rawData, currentHistoryAttr, intervalMs);
        
        // 自定义时间范围传入0作为days参数，使用默认格式
        renderHistoryChart(aggregatedData, currentHistoryAttr, 0);
        
    } catch (error) {
        console.error('加载自定义时间数据失败:', error);
        showError(`加载历史数据失败: ${error.message}`);
    } finally {
        historyLoading.style.display = 'none';
    }
}

/**
 * 设置激活的属性按钮
 * @param {HTMLElement} btn 按钮元素
 */
function setActiveAttrBtn(btn) {
    historyAttrBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentHistoryAttr = btn.dataset.attr;
    
    // 判断是快捷按钮还是自定义时间
    const activeTimeBtn = document.querySelector('.history-time-btn.active');
    if (activeTimeBtn) {
        // 快捷按钮
        const days = parseInt(activeTimeBtn.dataset.days);
        loadHistoryData(currentHistoryAttr, days);
    } else {
        // 自定义时间
        queryCustomTimeData();
    }
}

/**
 * 设置激活的时间范围按钮
 * @param {HTMLElement} btn 按钮元素
 */
function setActiveTimeBtn(btn) {
    historyTimeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTimeRange = parseInt(btn.dataset.days);
    loadHistoryData(currentHistoryAttr, currentTimeRange);
}

/**
 * 初始化历史数据模块
 */
function initHistoryModule() {
    // 绑定属性按钮事件
    historyAttrBtns.forEach(btn => {
        btn.addEventListener('click', () => setActiveAttrBtn(btn));
    });
    
    // 绑定时间范围按钮事件
    historyTimeBtns.forEach(btn => {
        btn.addEventListener('click', () => setActiveTimeBtn(btn));
    });
    
    // 初始加载24小时电压数据
    loadHistoryData('voltage', 1);
    
    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        if (historyChart) {
            historyChart.resize();
        }
    });
}

// ============ 初始化 ============
window.onload = function() {
    // 更新当前时间并初始化时间输入框
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // 初始化实时数据
    fetchDeviceData();
    
    // 定时刷新实时数据（50秒一次，避免频繁请求）
    setInterval(fetchDeviceData, 50 * 1000);
    
    // 初始化阈值同步
    syncVoltageMaxFromInput();
    syncCurrentMaxFromInput();
    syncPowerMaxFromInput();
    syncCurrentPriceFromInput();
    syncPriceThresholdFromInput();
    // 新增阈值同步
    syncPowerLowThresholdFromInput();
    syncLowPowerDurationFromInput();
    
    // 初始化历史数据模块
    initHistoryModule();
};