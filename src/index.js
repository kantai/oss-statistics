const fetch = require('cross-fetch')
const config = require('./config.json')

const github = 'https://api.github.com'

const org = config.org
const reposToSkip = config.reposToSkip
const internals = config.team

let API_KEY = ''
let repoData = false
let count = 0

const MS_IN_A_MONTH = Math.floor(1000 * 60 * 60 * 24 * 30.5)
const MS_IN_A_WEEK = Math.floor(1000 * 60 * 60 * 24 * 7)

function authFetch(url) {
  return fetch(url, { headers: {'Authorization': `token ${API_KEY}` } })
}

function updateStatus() {
  count += 1
  const counter = document.getElementById(`data-count`)
  counter.innerHTML = `${count}`
}

function displayStatusArea() {
  const statusArea = document.getElementById('status-wrapper')
  statusArea.classList.remove('invisible')
}

function hideStatusArea() {
  const statusArea = document.getElementById('status-wrapper')
  statusArea.classList.add('invisible')
}

async function getIssuePageData(repo, startPage, since) {
  updateStatus()
  const basisUrl = `${github}/repos/${org}/${repo}/issues?direction=asc&state=all&since=${since}`
  let issuePage = startPage
  const output = []

  while (true) {
    const pageResp = await authFetch(`${basisUrl}&page=${issuePage}`)
    const pageJSON = await pageResp.json()
    if (pageJSON.length <= 0) {
      break
    } else {
      pageJSON.forEach(x => output.push(x))
    }
    issuePage = issuePage + 1
    updateStatus()
  }

  return output
}

async function getAllRepos() {
  const basisUrl = `${github}/orgs/${org}/repos`
  let repoPage = 1
  const output = []
  while (true) {
    const pageResp = await authFetch(`${basisUrl}?page=${repoPage}`)
    const pageJSON = await pageResp.json()
    if (pageJSON.length <= 0) {
      break
    } else {
      pageJSON.forEach(x => {
        const repoName = x.name
        if (reposToSkip.indexOf(repoName) < 0) {
          output.push(repoName)
        }
      })
    }
    repoPage += 1
  }

  return output
}

function getIssueComments(repo, issue, since) {
  updateStatus()
  const url = since ?
        `${github}/repos/${org}/${repo}/issues/${issue}/comments?since=${since}`
        : `${github}/repos/${org}/${repo}/issues/${issue}/comments`
  return authFetch(url).then(x => x.json())
}

async function fetchMonthStatistics() {
  const sinceDate = new Date(Date.now() - MS_IN_A_MONTH)
  const since = sinceDate.toISOString()

  const sinceWeek = new Date(Date.now() - MS_IN_A_WEEK).toISOString()

  const repoNames = await getAllRepos()

  const repos = await Promise.all(repoNames.map(name => {
    return getIssuePageData(name, 1, since)
      .then(issues => ({ name, issues }))
      .then(repo => {
        return Promise.all(repo.issues.map(issue => {
          const createdDate = new Date(issue.created_at)
          if (createdDate - sinceDate >= 0) {
            return getIssueComments(repo.name, issue.number)
              .then(commentsData => Object.assign({}, issue, { commentsData }))
          } else {
            return getIssueComments(repo.name, issue.number, sinceWeek)
              .then(commentsData => Object.assign({}, issue, { commentsData }))
          }
        }))
          .then(issues => ({ name: repo.name, issues }))
      })
  }))

  return repos
}


function median(x) {
  if (x.length === 0) {
    return 0
  }
  x.sort()
  if (x.length % 2 == 0) {
    return (x[Math.floor(x.length/2)] + x[Math.floor(x.length/2)+1])/2
  } else {
    return x[Math.floor(x.length/2) + 1]
  }
}

function getIssuesStats(issues) {
  const total = issues.length
  const closed = issues.filter(issue => issue.state === 'closed').length
  const daysToFirstResponse = issues.map(issue => {
    if (issue.commentsData && issue.commentsData.length >= 1) {
      const issueDate = new Date(issue.created_at)
      const firstReply = new Date(issue.commentsData[0].created_at)
      return (firstReply - issueDate) / (1000 * 60 * 60 * 24)
    } else {
      return false
    }
  })
  const daysToClose = issues.map(issue => {
    if (issue.state === 'closed') {
      const issueDate = new Date(issue.created_at)
      const firstReply = new Date(issue.closed_at)
      return (firstReply - issueDate) / (1000 * 60 * 60 * 24)
    } else {
      return false
    }
  })
  const issuesWithoutResponse = daysToFirstResponse.filter(x => x === false).length
  const medianDaysToFirstResponse = median(daysToFirstResponse.filter(x => x !== false))
  const medianDaysToClose = median(daysToClose.filter(x => x !== false))
  return {
    issuesWithoutResponse,
    issuesOpen: total - closed,
    issuesClosed: closed,
    medianDaysToClose: Math.round(10*medianDaysToClose)/10,
    medianDaysToFirstResponse: Math.round(10*medianDaysToFirstResponse)/10
  }
}

function isExternal(issue) {
  return internals.indexOf(issue.user.login) < 0
}

function print(stats) {
  const statRow = [stats.issuesOpen, stats.issuesClosed, stats.issuesWithoutResponse,
                   stats.medianDaysToClose, stats.medianDaysToFirstResponse]

  return statRow.map(x => `<td>${x}</td>`).join('')
}

function analyzePRs(repos) {
  const sinceDate = new Date(Date.now() - MS_IN_A_WEEK)
  const usersCommented = {}

  const usersOpened = {}

  const allUsers = []

  repos.forEach(repo => {
    const prs = repo.issues.filter(x => x.pull_request)

    const newPRs = prs.filter(x => {
      return ((new Date(x.created_at) - sinceDate) >= 0) && !isExternal(x)
    })

    newPRs.forEach(x => {
      const pr = x.pull_request.html_url
      const user = x.user.login
      if (usersOpened[user]) {
        usersOpened[user].push(pr)
      } else {
        usersOpened[user] = [pr]
      }
      if (allUsers.indexOf(user) < 0) {
        allUsers.push(user)
      }
    })

    prs.forEach(x => {
      const pr = x.pull_request.html_url
      const recent = x.commentsData.filter( z => (new Date(z.created_at) - sinceDate >= 0))
      const users = recent.filter(z => !isExternal(z)).map(z => z.user.login)
      users.forEach(z => {
        if (usersCommented[z] && usersCommented[z].indexOf(pr) < 0) {
          usersCommented[z].push(pr)
        } else {
          usersCommented[z] = [pr]
        }
        if (allUsers.indexOf(z) < 0) {
          allUsers.push(z)
        }
      })
    })
  })

  const data = allUsers.map(user => ({user, opened: usersOpened[user], commented: usersCommented[user] }))

  let outputStr = ''
  outputStr += `<h1>PRs worked on by user</h1>`
  data.forEach(datum => {
    outputStr += `<h2>${datum.user}</h2>`
    const opened = datum.opened ? datum.opened.map(x => `<li>${x}</li>`).join('') : ''
    const commented = datum.commented ? datum.commented.map(x => `<li>${x}</li>`).join('') : ''
    outputStr += `<h3>Opened PRs</h3>`
    outputStr += `<ol>${opened}</ol>`
    outputStr += `<h3>Commented on PRs</h3>`
    outputStr += `<ol>${commented}</ol>`
  })

  return outputStr
}

function analyzeOSS(repos) {
  const sinceDate = new Date(Date.now() - MS_IN_A_MONTH)
  const allIssues = []
  const externalIssues = []
  const allPRs = []
  const externalPRs = []

  const repoAnalysis = repos.map(repo => {
    const issues = repo.issues.filter(x => {
      return (new Date(x.created_at) - sinceDate >= 0)
    }).filter(x => !(x.pull_request))

    const prs = repo.issues.filter(x => {
      return (new Date(x.created_at) - sinceDate >= 0)
    }).filter(x => x.pull_request)

    const allStats = getIssuesStats(issues)
    const issuesOpenedByOthers = issues.filter(x => isExternal(x))
    const externalStats = getIssuesStats(issuesOpenedByOthers)

    const allStatsPRs = getIssuesStats(prs)
    const PRsOpenedByOthers = prs.filter(x => isExternal(x))
    const externalStatsPrs = getIssuesStats(PRsOpenedByOthers)

    issues.forEach(x => allIssues.push(x))
    issuesOpenedByOthers.forEach(x => externalIssues.push(x))

    prs.forEach(x => allPRs.push(x))
    PRsOpenedByOthers.forEach(x => externalPRs.push(x))

    return { name: repo.name,
             allStats, externalStats,
             allStatsPRs, externalStatsPrs }
  })

  const sumAnalysis = {
    allStats: getIssuesStats(allIssues),
    externalStats: getIssuesStats(externalIssues),
    allPRStats: getIssuesStats(allPRs),
    externalPRStats: getIssuesStats(externalPRs)
  }

  let outputStr = ''

  outputStr += `<h3>Statistics for issues/PRs created since ${sinceDate}</h3>`
  outputStr += '<br/><table class="table">'
  outputStr += '<tr><td></td><td colspan=5>issues</td><td colspan=5>PRs</td></tr>'
  outputStr += '<tr><td></td><td>open</td><td>closed</td><td>no response</td><td>days to close</td><td>days to response</td><td>open</td><td>closed</td><td>no response</td><td>days to close</td><td>days to response</td></tr>'
  outputStr += `<tr><td>All creators</td>${print(sumAnalysis.allStats)}${print(sumAnalysis.allPRStats)}</tr>`
  outputStr += `<tr><td>External only</td>${print(sumAnalysis.externalStats)}${print(sumAnalysis.externalPRStats)}</tr>`
  outputStr += '</table><br/>'

  outputStr += '<h3>Per Repo Statistics</h3>'
  outputStr += '<br/><table class="table">'
  outputStr += '<tr><td></td><td colspan=5>issues</td><td colspan=5>PRs</td></tr>'
  outputStr += '<tr><td></td><td>open</td><td>closed</td><td>no response</td><td>days to close</td><td>days to response</td><td>open</td><td>closed</td><td>no response</td><td>days to close</td><td>days to response</td></tr>'

  repoAnalysis.forEach(repo => {
    if (repo.allStats.issuesOpen + repo.allStats.issuesClosed > 0) {
      outputStr += `<tr><td>${repo.name.padStart(20).slice(0, 20)}</td>${print(repo.allStats)}${print(repo.allStatsPRs)}</tr>`
      outputStr += `<tr><td>External only</td>${print(repo.externalStats)}${print(repo.externalStatsPrs)}</tr>`
    }
  })

  outputStr += '</table>'
  return outputStr
}


async function runAnalysis(forceFetch) {
  const apiKey = document.getElementById('api-key').value.trim()
  API_KEY = apiKey

  if (!forceFetch && localStorage.hasOwnProperty('repoData')) {
    repoData = JSON.parse(localStorage.getItem('repoData'))
  } else {
    displayStatusArea()
    repoData = await fetchMonthStatistics()
  }


  localStorage.setItem('repoData', JSON.stringify(repoData))
//  hideStatusArea()

  const communityMetrics = analyzeOSS(repoData)
  const prMetrics = analyzePRs(repoData)

  const messageContainer = document.getElementById('message-wrapper')
  const messageArea = document.getElementById('message')

  messageContainer.classList.remove('invisible')
  messageArea.innerHTML = communityMetrics

  const messageContainerPR = document.getElementById('pr-message-wrapper')
  const messageAreaPR = document.getElementById('pr-message')

  messageContainerPR.classList.remove('invisible')
  messageAreaPR.innerHTML = prMetrics

}

window.runAnalysis = runAnalysis
