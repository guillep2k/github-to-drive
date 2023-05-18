import multimatch from 'multimatch'

export class fileMatcher {
  private patterns: string[] | undefined
  constructor(patterns: string | undefined) {
    this.patterns = this.getGlob(patterns)
  }
  private getGlob(patterns: string | undefined): string[] | undefined {
    if (!patterns) return undefined
    return patterns
      .split('|')
      .map(p => p.trim())
      .filter(p => p)
  }
  public matches(path: string): boolean {
    if (this.patterns) {
      // Make all paths 'absolute'
      const res = multimatch(['/' + path], this.patterns)
      if (res.length == 0) return false
    }
    return true
  }
}
