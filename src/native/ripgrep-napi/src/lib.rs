use napi::bindgen_prelude::*;
use napi_derive::napi;
use grep::{
    matcher::{Matcher, Match},
    regex::RegexMatcherBuilder,
    searcher::{Searcher, SearcherBuilder, Sink, SinkMatch},
};
use grep_searcher::{SearcherBuilder as GrepSearcherBuilder, lines};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Ripgrep search result match
#[napi(object)]
pub struct RipgrepMatch {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub text: String,
    pub submatches: Vec<SubMatch>,
}

/// Submatch within a line
#[napi(object)]
pub struct SubMatch {
    pub start: u32,
    pub end: u32,
}

/// Search options
#[napi(object)]
pub struct RipgrepOptions {
    pub pattern: String,
    pub path: String,
    pub case_insensitive: Option<bool>,
    pub glob: Option<String>,
    pub max_depth: Option<u32>,
    pub max_results: Option<u32>,
    pub before_context: Option<u32>,
    pub after_context: Option<u32>,
    pub files_with_matches: Option<bool>,
    pub include_hidden: Option<bool>,
}

/// Search result
#[napi(object)]
pub struct RipgrepResult {
    pub matches: Vec<RipgrepMatch>,
    pub files_searched: u32,
    pub total_matches: u32,
    pub truncated: bool,
    pub elapsed_ms: u32,
}

/// Ripgrep search state
#[napi]
pub struct RipgrepSearcher {
    matcher: Arc<RegexMatcherBuilder>,
    searcher: Arc<Mutex<Searcher>>,
    results: Arc<Mutex<Vec<RipgrepMatch>>>,
    files_searched: Arc<Mutex<u32>>,
    max_results: Option<u32>,
}

#[napi]
impl RipgrepSearcher {
    /// Create a new ripgrep searcher
    #[napi(constructor)]
    pub fn new(opts: RipgrepOptions) -> Result<Self> {
        let mut builder = RegexMatcherBuilder::new();
        builder.case_insensitive(opts.case_insensitive.unwrap_or(false));
        
        let matcher = Arc::new(builder);
        let searcher = Arc::new(Mutex::new(SearcherBuilder::new()
            .before_context(opts.before_context.unwrap_or(0))
            .after_context(opts.after_context.unwrap_or(0))
            .build()));
        let results = Arc::new(Mutex::new(Vec::new()));
        let files_searched = Arc::new(Mutex::new(0));
        
        Ok(Self {
            matcher,
            searcher,
            results,
            files_searched,
            max_results: opts.max_results,
        })
    }

    /// Search for pattern in path
    #[napi]
    pub async fn search(&self, opts: RipgrepOptions) -> Result<RipgrepResult> {
        let start = std::time::Instant::now();
        
        // Clear previous results
        {
            let mut results = self.results.lock().unwrap();
            results.clear();
            let mut files = self.files_searched.lock().unwrap();
            *files = 0;
        }

        // Build walker
        let mut walker_builder = ignore::WalkBuilder::new(&opts.path);
        walker_builder
            .hidden(!opts.include_hidden.unwrap_or(false))
            .git_ignore(true)
            .max_depth(opts.max_depth.map(|d| d as usize));

        if let Some(glob) = &opts.glob {
            walker_builder.add_custom_ignore_filename(".rgignore");
        }

        let walker = walker_builder.build();

        // Search each entry
        for entry in walker {
            if let Ok(entry) = entry {
                if entry.file_type().map_or(false, |ft| ft.is_file()) {
                    let path = entry.path().to_path_buf();
                    
                    // Check glob pattern
                    if let Some(glob) = &opts.glob {
                        if let Some(name) = path.file_name() {
                            if !glob_match(glob, name.to_string_lossy().as_ref()) {
                                continue;
                            }
                        }
                    }

                    // Search file
                    let mut searcher = self.searcher.lock().unwrap();
                    let matcher = self.matcher.build(&opts.pattern).map_err(|e| Error::from_reason(format!("Regex error: {}", e)))?;
                    
                    let mut sink = MatchSink {
                        path: path.clone(),
                        results: self.results.clone(),
                        max_results: self.max_results,
                        stopped: false,
                    };

                    let _ = searcher.search_path(&matcher, &path, &mut sink);
                    
                    {
                        let mut files = self.files_searched.lock().unwrap();
                        *files += 1;
                    }

                    // Check if we should stop
                    if sink.stopped {
                        break;
                    }
                }
            }
        }

        let elapsed = start.elapsed();
        let results = self.results.lock().unwrap();
        let files = self.files_searched.lock().unwrap();
        
        let truncated = self.max_results.map_or(false, |max| results.len() as u32 >= max);
        
        Ok(RipgrepResult {
            matches: results.clone(),
            files_searched: *files,
            total_matches: results.len() as u32,
            truncated,
            elapsed_ms: elapsed.as_millis() as u32,
        })
    }

    /// Get version
    #[napi]
    pub fn version(&self) -> String {
        "1.0.0 (ripgrep-napi)".to_string()
    }
}

/// Sink that collects matches
struct MatchSink {
    path: PathBuf,
    results: Arc<Mutex<Vec<RipgrepMatch>>>,
    max_results: Option<u32>,
    stopped: bool,
}

impl Sink for MatchSink {
    type Match = ();

    fn matched(
        &mut self,
        _searcher: &Searcher,
        mat: &SinkMatch,
    ) -> Result<bool, grep_searcher::Error> {
        // Check if we've hit max results
        if let Some(max) = self.max_results {
            let results = self.results.lock().unwrap();
            if results.len() as u32 >= max {
                self.stopped = true;
                return Ok(false);
            }
        }

        let line = String::from_utf8_lossy(mat.lines().next().unwrap_or(&[]));
        let mut submatches = Vec::new();
        
        for m in mat.matches() {
            submatches.push(SubMatch {
                start: m.start() as u32,
                end: m.end() as u32,
            });
        }

        let match_entry = RipgrepMatch {
            path: self.path.to_string_lossy().to_string(),
            line: mat.absolute_line_number(),
            column: submatches.first().map(|s| s.start).unwrap_or(0),
            text: line.to_string(),
            submatches,
        };

        {
            let mut results = self.results.lock().unwrap();
            results.push(match_entry);
        }

        Ok(!self.stopped)
    }
}

/// Simple glob matching
fn glob_match(pattern: &str, text: &str) -> bool {
    let regex_pattern = pattern
        .replace('.', "\\.")
        .replace('*', ".*")
        .replace('?', ".");
    
    let re = regex::Regex::new(&format!("^{}$", regex_pattern)).unwrap();
    re.is_match(text)
}

/// Convenience function for searching
#[napi]
pub async fn search(opts: RipgrepOptions) -> Result<RipgrepResult> {
    let searcher = RipgrepSearcher::new(opts.clone())?;
    searcher.search(opts).await
}

/// Search for files matching pattern
#[napi]
pub async fn search_files(opts: RipgrepOptions) -> Result<Vec<String>> {
    let result = search(opts).await?;
    let mut files: Vec<String> = result.matches.into_iter()
        .map(|m| m.path)
        .collect();
    files.sort();
    files.dedup();
    Ok(files)
}
