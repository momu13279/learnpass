/**
 * 学习通 API 模块
 * 通过 Cookie 认证方式获取学习通数据
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

// 学习通域名配置
const BASE_URLS = {
  passport: 'https://passport2.chaoxing.com',
  moocApi: 'https://mooc1-api.chaoxing.com',
  mooc1: 'https://mooc1.chaoxing.com',
  mobile: 'https://mobilelearn.chaoxing.com'
};

// PC端 User-Agent
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 创建带 Cookie 的 axios 实例
 */
function createClient(cookieStr) {
  return axios.create({
    timeout: 15000,
    headers: {
      'User-Agent': PC_UA,
      'Cookie': cookieStr || '',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://mooc1-api.chaoxing.com/'
    },
    maxRedirects: 5,
    validateStatus: function (status) {
      return status < 500;
    }
  });
}

/**
 * 验证 Cookie 是否有效
 */
async function validateCookie(cookieStr) {
  try {
    const client = createClient(cookieStr);
    const res = await client.get(`${BASE_URLS.moocApi}/mycourse/backclazzdata?view=json`);
    if (res.data && (res.data.channelList || res.data.courseList)) {
      return { valid: true };
    }
    if (res.request && res.request.res && res.request.res.responseUrl &&
        res.request.res.responseUrl.includes('passport')) {
      return { valid: false, message: 'Cookie已过期，请重新登录' };
    }
    return { valid: false, message: 'Cookie验证失败' };
  } catch (e) {
    return { valid: false, message: '网络错误：' + e.message };
  }
}

/**
 * 获取课程列表（JSON API）
 */
async function getCourseList(cookieStr) {
  try {
    const client = createClient(cookieStr);
    const res = await client.get(`${BASE_URLS.moocApi}/mycourse/backclazzdata?view=json&mcode=`);

    if (!res.data || !res.data.channelList) {
      return { success: false, message: '获取课程列表失败，可能Cookie已过期' };
    }

    const courses = [];
    for (const channel of res.data.channelList) {
      if (!channel.content || !channel.content.course || !channel.content.course.data) continue;
      for (const course of channel.content.course.data) {
        courses.push({
          courseId: course.id || course.courseId || '',
          courseName: course.name || course.courseName || '未命名课程',
          teacher: course.teacher || course.creater || '',
          clazzid: course.clazzid || course.classId || '',
          cpi: course.cpi || '',
          image: course.img || course.courseimg || ''
        });
      }
    }

    return { success: true, data: courses };
  } catch (e) {
    return { success: false, message: '获取课程列表出错：' + e.message };
  }
}

/**
 * 获取所有作业列表
 */
async function getAllHomeworks(cookieStr) {
  try {
    const client = createClient(cookieStr);
    const res = await client.get(`${BASE_URLS.moocApi}/work/stu-work`);

    const html = res.data;
    if (typeof html !== 'string') {
      return { success: false, message: '获取作业页面失败' };
    }

    if (html.includes('passport2.chaoxing.com') || html.includes('请先登录')) {
      return { success: false, message: 'Cookie已过期，请重新登录' };
    }

    // 保存 HTML 用于调试分析
    const debugPath = path.join(require('os').tmpdir(), 'chaoxing_homework_debug.html');
    fs.writeFileSync(debugPath, html, 'utf-8');
    console.log('[Chaoxing] 作业页面HTML已保存到:', debugPath);

    const homeworks = parseHomeworkHTML(html);
    console.log('[Chaoxing] 解析到', homeworks.length, '项作业');

    return { success: true, data: homeworks };
  } catch (e) {
    return { success: false, message: '获取作业列表出错：' + e.message };
  }
}

/**
 * 解析作业列表 HTML
 */
function parseHomeworkHTML(html) {
  const homeworks = [];

  // 策略：匹配所有 li，然后在其中搜索 data 属性或 taskrefId URL
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const fullLi = match[0];
    const content = match[1];

    // 在整个 li 中查找 data 属性值（作业/考试列表项的特征）
    let dataUrl = '';
    const dataAttrMatch = fullLi.match(/data="([^"]*)"/i);
    if (dataAttrMatch) {
      const val = dataAttrMatch[1];
      // data 属性值应该是 mooc-ans 的 URL
      if (val.includes('mooc-ans') || val.includes('taskrefId') || val.includes('courseId')) {
        dataUrl = val;
      }
    }

    // 如果没有 data 属性，尝试从 href 中找
    if (!dataUrl) {
      const hrefMatch = fullLi.match(/href="([^"]*mooc-ans[^"]*)"/i) ||
                       fullLi.match(/href="([^"]*taskrefId[^"]*)"/i);
      if (hrefMatch) {
        dataUrl = hrefMatch[1];
      }
    }

    // 跳过没有有效 URL 的 li
    if (!dataUrl) continue;

    try {
      // 从 data URL 中提取参数
      const urlParams = {};
      const paramPairs = dataUrl.split(/[?&]/);
      for (const pair of paramPairs) {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          urlParams[pair.substring(0, eq)] = decodeURIComponent(pair.substring(eq + 1));
        }
      }

      // 提取作业名称 - 直接从 <p> 标签提取（最可靠）
      let title = '';
      const pMatch = content.match(/<p[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/p>/i) ||
                   content.match(/<p[^>]*>([^<]+)<\/p>/i);
      if (pMatch) {
        title = pMatch[1].replace(/<[^>]*>/g, '').trim();
      }

      // 提取剩余时间 - class="fr" 的 span
      let leftTime = '';
      const frMatch = content.match(/<span[^>]*class="fr"[^>]*>([\s\S]*?)<\/span>/i);
      if (frMatch) {
        leftTime = frMatch[1].replace(/<[^>]*>/g, '').trim();
      }

      // 状态关键词列表
      const statusKeywords = ['已批阅', '已提交', '已完成', '已截止', '已过期', '逾期', '未交', '进行中', '待完成', '未完成', '待批阅', '已互评', '待互评', '未提交', '待重做'];

      // 提取状态和课程名 - 从 aria-hidden="true" 的 span 中提取
      let statusText = '';
      let courseName = '';
      const spanMatches = content.match(/<span[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/span>/gi);
      if (spanMatches) {
        for (const span of spanMatches) {
          const text = span.replace(/<[^>]*>/g, '').trim();
          if (!text) continue;
          // 检查是否是状态文字
          if (statusKeywords.some(k => text.includes(k))) {
            if (!statusText) statusText = text;
            continue;
          }
          // 课程名（不是状态，不是剩余时间）
          if (!text.includes('剩余') && !text.startsWith('作业名称') && text.length > 1) {
            if (!courseName) courseName = text;
          }
        }
      }

      // 如果还是没有状态，尝试从 class="status" 的 span 提取
      if (!statusText) {
        const statusMatch = content.match(/<span[^>]*class="status"[^>]*>([\s\S]*?)<\/span>/i);
        if (statusMatch) {
          statusText = statusMatch[1].replace(/<[^>]*>/g, '').trim();
        }
      }

      // 提取 aria-label 中的完整描述
      let fullDesc = '';
      const ariaMatch = content.match(/aria-label="([^"]*)"/i);
      if (ariaMatch) {
        fullDesc = ariaMatch[1].trim();
      }

      // 如果 status 为空，从 aria-label 提取
      if (!statusText && fullDesc) {
        for (const kw of statusKeywords) {
          if (fullDesc.includes(kw)) {
            statusText = kw;
            break;
          }
        }
      }

      // 如果还是没有课程名，从 aria-label 中提取
      if (!courseName && fullDesc) {
        const courseMatch = fullDesc.match(/所属课程([^\s]+)/);
        if (courseMatch) {
          courseName = courseMatch[1];
        }
      }

      // 截止时间：从剩余时间推算（如果没有直接截止时间字段）
      let deadline = '';

      if (fullDesc) {
        const timeMatch = fullDesc.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
        if (timeMatch) {
          deadline = timeMatch[1];
        }
      }

      // 如果没有截止时间，从整个 li 内容中搜索时间
      if (!deadline) {
        const allText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const timeInContent = allText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
        if (timeInContent) {
          deadline = timeInContent[1];
        }
      }

      // 判断状态
      // "待批阅" = 学生已提交，等待老师批改 → 已完成
      // "已批阅" = 老师已批改完成 → 已完成
      // "已互评" = 互评已完成 → 已完成
      // "待互评" = 等待互评 → 待互评（独立状态）
      // "已提交"/"已完成" → 已完成
      // "已截止"/"已过期"/"逾期" → 已逾期
      // "未交"/"未提交" → 需要进一步判断：有剩余时间=待处理，无剩余时间=已逾期
      // "进行中" → 进行中
      // 其他 → 待处理
      let status = 'pending';
      let submitStatus = 'not_submitted';
      if (statusText) {
        if (['已批阅','已提交','已完成','待批阅','已互评'].some(k => statusText.includes(k))) {
          status = 'completed';
          submitStatus = 'submitted';
        } else if (statusText.includes('待互评')) {
          status = 'peer_review';
          submitStatus = 'submitted';
        } else if (['已截止','已过期','逾期'].some(k => statusText.includes(k))) {
          status = 'overdue';
        } else if (['未交','未提交'].some(k => statusText.includes(k))) {
          // "未提交"需要进一步判断：如果有剩余时间则是待处理，如果没有则可能是已逾期
          if (!leftTime || leftTime.includes('已过期') || leftTime.includes('逾期')) {
            status = 'overdue';
          } else {
            status = 'pending';
          }
        } else if (statusText.includes('进行中')) {
          status = 'in_progress';
        } else if (statusText.includes('待重做')) {
          status = 'overdue';
        }
      }

      // 检查内容中是否包含"已互评"或"待互评"文字（可能在其他位置）
      if (status === 'pending') {
        const contentText = content.replace(/<[^>]*>/g, '');
        if (contentText.includes('已互评')) {
          status = 'completed';
          submitStatus = 'submitted';
        } else if (contentText.includes('待互评')) {
          status = 'peer_review';
          submitStatus = 'submitted';
        }
      }

      // 如果状态仍为待处理，根据截止时间自动判断
      if (status === 'pending' && deadline) {
        const dlDate = new Date(deadline.replace(' ', 'T'));
        if (!isNaN(dlDate.getTime()) && dlDate < new Date()) {
          status = 'overdue';
        }
      }

      // 从 data URL 中提取 ID
      const workId = urlParams.taskrefId || urlParams.workId || urlParams.id || '';
      const courseId = urlParams.courseId || '';

      homeworks.push({
        lp_homework_id: workId,
        course_id: courseId,
        homework_name: title || '未命名作业',
        course_name: courseName || '',
        description: fullDesc,
        deadline: deadline,
        status: status,
        submit_status: submitStatus,
        left_time: leftTime,
        source_url: dataUrl
      });
    } catch (e) {
      console.error('解析作业项失败:', e.message);
    }
  }

  return homeworks;
}

/**
 * 获取所有考试列表
 */
async function getAllExams(cookieStr) {
  try {
    const client = createClient(cookieStr);
    const res = await client.get(`${BASE_URLS.moocApi}/exam-ans/exam/phone/examcode`);

    const html = res.data;
    if (typeof html !== 'string') {
      return { success: false, message: '获取考试页面失败' };
    }

    if (html.includes('passport2.chaoxing.com') || html.includes('请先登录')) {
      return { success: false, message: 'Cookie已过期，请重新登录' };
    }

    const exams = parseExamHTML(html);
    console.log('[Chaoxing] 解析到', exams.length, '场考试');

    return { success: true, data: exams };
  } catch (e) {
    return { success: false, message: '获取考试列表出错：' + e.message };
  }
}

/**
 * 解析考试列表 HTML
 */
function parseExamHTML(html) {
  const exams = [];

  // 策略：匹配所有 li，然后在其中搜索 data 属性或 taskrefId URL
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const fullLi = match[0];
    const content = match[1];

    // 在整个 li 中查找 data 属性值
    let dataUrl = '';
    const dataAttrMatch = fullLi.match(/data="([^"]*)"/i);
    if (dataAttrMatch) {
      const val = dataAttrMatch[1];
      if (val.includes('mooc-ans') || val.includes('taskrefId') || val.includes('courseId')) {
        dataUrl = val;
      }
    }

    if (!dataUrl) {
      const hrefMatch = fullLi.match(/href="([^"]*mooc-ans[^"]*)"/i) ||
                       fullLi.match(/href="([^"]*taskrefId[^"]*)"/i);
      if (hrefMatch) {
        dataUrl = hrefMatch[1];
      }
    }

    // 跳过没有有效 URL 的 li
    if (!dataUrl) continue;

    try {
      // 从 data URL 中提取参数
      const urlParams = {};
      const paramPairs = dataUrl.split(/[?&]/);
      for (const pair of paramPairs) {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          urlParams[pair.substring(0, eq)] = decodeURIComponent(pair.substring(eq + 1));
        }
      }

      // 提取考试名称 - 在 <dl class="ks_text"> 内的 <dt> 标签
      let title = '';
      const dlMatch = content.match(/<dl[^>]*class="ks_text"[^>]*>([\s\S]*?)<\/dl>/i);
      if (dlMatch) {
        const dtMatch = dlMatch[1].match(/<dt[^>]*>([\s\S]*?)<\/dt>/i);
        if (dtMatch) {
          title = dtMatch[1].replace(/<[^>]*>/g, '').trim();
        }
      }

      // 提取时间信息 - 在 <dd> 标签
      let timeInfo = '';
      if (dlMatch) {
        const ddMatch = dlMatch[1].match(/<dd[^>]*>([\s\S]*?)<\/dd>/i);
        if (ddMatch) {
          timeInfo = ddMatch[1].replace(/<[^>]*>/g, '').trim();
        }
      }

      // 提取状态 - class="ks_state" 的 span
      let statusText = '';
      const stateMatch = content.match(/<span[^>]*class="ks_state"[^>]*>([\s\S]*?)<\/span>/i);
      if (stateMatch) {
        statusText = stateMatch[1].replace(/<[^>]*>/g, '').trim();
      }

      // 从 aria-label 中提取完整描述
      let fullDesc = '';
      const ariaMatch = content.match(/<dl[^>]*aria-label="([^"]*)"[^>]*>/i);
      if (ariaMatch) {
        fullDesc = ariaMatch[1].trim();
      }

      // 解析时间信息
      let startTime = '';
      let endTime = '';

      // 尝试从 timeInfo 提取时间
      const timeMatches = timeInfo.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{1,2})/g);
      if (timeMatches) {
        startTime = timeMatches[0] || '';
        endTime = timeMatches[1] || '';
      }

      // 如果 timeInfo 没提取到，尝试从 aria-label 提取
      if (!startTime && fullDesc) {
        const ariaTimeMatches = fullDesc.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{1,2})/g);
        if (ariaTimeMatches) {
          startTime = ariaTimeMatches[0] || '';
          endTime = ariaTimeMatches[1] || '';
        }
      }

      // 判断状态
      // "待批阅" = 学生已完成考试，等待老师批改 → 视为已完成
      let status = 'pending';
      if (statusText.includes('已结束') || statusText.includes('已完成') || statusText.includes('待批阅') || statusText.includes('已批阅')) {
        status = 'completed';
      } else if (statusText.includes('已过期') || statusText.includes('已截止')) {
        status = 'overdue';
      } else if (statusText.includes('进行中')) {
        status = 'in_progress';
      }

      // 如果状态仍为待处理，根据结束时间自动判断
      if (status === 'pending' && endTime) {
        const endDate = new Date(endTime.replace(' ', 'T'));
        if (!isNaN(endDate.getTime()) && endDate < new Date()) {
          status = 'overdue';
        }
      }

      // 如果 still pending 且没有 endTime，尝试从 title 中的日期判断
      // 例如 "试卷20260430103829" 表示 2026-04-30
      if (status === 'pending' && !endTime) {
        const titleDateMatch = title.match(/(\d{4})(\d{2})(\d{2})/);
        if (titleDateMatch) {
          const titleDate = new Date(`${titleDateMatch[1]}-${titleDateMatch[2]}-${titleDateMatch[3]}T23:59:00`);
          if (!isNaN(titleDate.getTime()) && titleDate < new Date()) {
            status = 'overdue';
          }
        }
      }

      // 从 data URL 中提取 ID
      const examId = urlParams.taskrefId || urlParams.examId || urlParams.id || '';
      const courseId = urlParams.courseId || '';

      exams.push({
        lp_exam_id: examId,
        course_id: courseId,
        exam_name: title || '未命名考试',
        course_name: '',
        description: fullDesc,
        start_time: startTime,
        end_time: endTime,
        location: '',
        duration: 0,
        status: status,
        source_url: dataUrl
      });
    } catch (e) {
      console.error('解析考试项失败:', e.message);
    }
  }

  return exams;
}

/**
 * 完整同步：获取课程、作业、考试
 */
async function syncAll(cookieStr) {
  const result = {
    success: false,
    courses: [],
    homeworks: [],
    exams: [],
    message: ''
  };

  try {
    const valid = await validateCookie(cookieStr);
    if (!valid.valid) {
      result.message = valid.message;
      return result;
    }

    const [courseRes, hwRes, examRes] = await Promise.all([
      getCourseList(cookieStr),
      getAllHomeworks(cookieStr),
      getAllExams(cookieStr)
    ]);

    if (courseRes.success) {
      result.courses = courseRes.data;
    }

    if (hwRes.success) {
      const courseMap = {};
      result.courses.forEach(c => { courseMap[c.courseId] = c.courseName; });
      hwRes.data.forEach(hw => {
        if (!hw.course_name && hw.course_id && courseMap[hw.course_id]) {
          hw.course_name = courseMap[hw.course_id];
        }
      });
      // 合并重复作业：按 lp_homework_id 去重，保留状态更优的版本
      // 状态优先级：completed > peer_review > in_progress > overdue > pending
      const statusPriority = { completed: 5, peer_review: 4, in_progress: 3, overdue: 2, pending: 1 };
      const hwMap = new Map();
      for (const hw of hwRes.data) {
        const key = hw.lp_homework_id || hw.homework_name;
        if (hwMap.has(key)) {
          const existing = hwMap.get(key);
          if ((statusPriority[hw.status] || 0) > (statusPriority[existing.status] || 0)) {
            hwMap.set(key, hw);
          }
        } else {
          hwMap.set(key, hw);
        }
      }
      result.homeworks = Array.from(hwMap.values());
    } else {
      console.warn('获取作业失败:', hwRes.message);
    }

    if (examRes.success) {
      const courseMap = {};
      result.courses.forEach(c => { courseMap[c.courseId] = c.courseName; });
      examRes.data.forEach(exam => {
        if (!exam.course_name && exam.course_id && courseMap[exam.course_id]) {
          exam.course_name = courseMap[exam.course_id];
        }
      });
      result.exams = examRes.data;
    } else {
      console.warn('获取考试失败:', examRes.message);
    }

    result.success = true;
    result.message = `同步完成：${result.courses.length}门课程，${result.homeworks.length}项作业，${result.exams.length}场考试`;
  } catch (e) {
    result.message = '同步出错：' + e.message;
  }

  return result;
}

module.exports = {
  validateCookie,
  getCourseList,
  getAllHomeworks,
  getAllExams,
  syncAll,
  BASE_URLS
};