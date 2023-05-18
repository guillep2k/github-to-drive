import multimatch from 'multimatch'

export class fileMatcher {
  private patterns: string[] | undefined
  constructor(patterns: string | undefined) {
    if (!patterns) return
    this.patterns = patterns
      .split('|')
      .map(p => p.trim())
      .filter(p => p)
    // Make sure to include all files first if we start with negations
    if (this.patterns.length > 0 && this.patterns[0].startsWith('!'))
      this.patterns.unshift('**/*')
  }
  public matches(path: string): boolean {
    if (this.patterns) {
      // Make all paths 'absolute'
      const res = multimatch([path], this.patterns)
      if (res.length == 0) return false
    }
    return true
  }
}
