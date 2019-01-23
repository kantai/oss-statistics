#!/usr/bin/env node

const fetch = require('cross-fetch')
const fs = require('fs')

const configLocation = process.env.CONFIG_FILE || './config.json'
const dataLocation = process.env.DATA_FILE || './data.json'

const config = JSON.parse(fs.readFileSync(configLocation))

const github = 'https://api.github.com'

const org = config.org
const reposToSkip = config.reposToSkip
const internals = config.team


function isExternal(issue) {
  return internals.indexOf(issue.user.login) < 0
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

function analyzeOSS(repos, fromDate, toDate) {
  const allIssues = []
  const externalIssues = []
  const allPRs = []
  const externalPRs = []

  const repoAnalysis = repos.map(repo => {
    const issues = repo.issues.filter(x => {
      const datetime = new Date(x.created_at)
      return ((datetime - fromDate >= 0)
              && (datetime - toDate <= 0))
    }).filter(x => !(x.pull_request))

    const prs = repo.issues.filter(x => {
      const datetime = new Date(x.created_at)
      return ((datetime - fromDate >= 0)
              && (datetime - toDate <= 0))
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

  const totalIssues = sumAnalysis.externalStats.issuesOpen + sumAnalysis.externalStats.issuesClosed
  const totalPRs = sumAnalysis.externalPRStats.issuesOpen + sumAnalysis.externalPRStats.issuesClosed

  const allExternal = [].concat(externalIssues).concat(externalPRs)

  const allExternalStats = getIssuesStats(allExternal)

  console.log(`Total issues: ${totalIssues}, Total PRs: ${totalPRs}`)
  console.log(`Response time (median days to first response): ${allExternalStats.medianDaysToFirstResponse}`)

  console.log(`More details:
${JSON.stringify(allExternalStats, undefined, 2)}`)
}



async function runAnalysis() {
  const repoData = JSON.parse(fs.readFileSync(dataLocation))
  const sinceDate = new Date(process.argv[2]);
  const untilDate = new Date(process.argv[3]);
  console.log(`Acquiring data for [${sinceDate}, ${untilDate}]`)

//  localStorage.setItem('repoData', JSON.stringify(repoData))
//  hideStatusArea()

  const communityMetrics = analyzeOSS(repoData, sinceDate, untilDate)
//  const prMetrics = analyzePRs(repoData)


}

runAnalysis()
