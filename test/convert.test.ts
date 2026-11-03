import { htmlToFetlife as convert } from '../src/convert';

describe('inline formatting', () => {
  test('bold, italic, strikethrough, combined', () => {
    expect(convert('<p><b>a</b> <i>b</i> <s>c</s> <b><i>d</i></b></p>')).toBe(
      '<p><strong>a</strong> <em>b</em> <s>c</s> <strong><em>d</em></strong></p>',
    );
  });
  test('style-based formatting (Google Docs)', () => {
    expect(convert('<p><span style="font-weight:700">B</span> <span style="font-style:italic">I</span> <span style="text-decoration:line-through">S</span></p>')).toBe(
      '<p><strong>B</strong> <em>I</em> <s>S</s></p>',
    );
  });
  test('font-weight:normal cancels the <b> wrapper Google Docs adds', () => {
    expect(convert('<b style="font-weight:normal" id="docs-internal-guid-1"><p>plain</p></b>')).toBe('<p>plain</p>');
  });
  test('colors, fonts, sizes, highlights and underline are dropped', () => {
    expect(convert('<p><u>u</u> <span style="color:#000;font-family:Arial;font-size:20pt;background:yellow">c</span> <mark>m</mark></p>')).toBe('<p>u c m</p>');
  });
  test('text is escaped', () => {
    expect(convert('<p>a &lt;b&gt; &amp; "c"</p>')).toBe('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>');
  });
  test('whitespace collapses like a browser shows it', () => {
    expect(convert('<p>  one \n  two&nbsp;&nbsp;three  </p>')).toBe('<p>one two three</p>');
  });
});

describe('Windows clipboard format', () => {
  test('ignores the StartFragment/EndFragment wrapper Chrome adds on Windows', () => {
    const windowsClipboard =
      '<html>\r\n<body>\r\n<!--StartFragment--><h1>Munch</h1><p>Come <b>say hi</b></p><!--EndFragment-->\r\n</body>\r\n</html>';
    expect(convert(windowsClipboard)).toBe('<h2>Munch</h2><p>Come <strong>say hi</strong></p>');
  });
  test('Word for Windows conditional comments and XML blocks are ignored', () => {
    const word =
      '<html><head><!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]--><style>p.MsoNormal{margin:0}</style></head><body><!--StartFragment--><p class=MsoNormal>Hi <b>there</b><o:p></o:p></p><!--EndFragment--></body></html>';
    expect(convert(word)).toBe('<p>Hi <strong>there</strong></p>');
  });
});

describe('links', () => {
  test('keeps absolute links, with formatting inside', () => {
    expect(convert('<p>Go <a href="https://ex.com/a?b=1&amp;c=2"><b>here</b></a>.</p>')).toBe(
      '<p>Go <a href="https://ex.com/a?b=1&amp;c=2"><strong>here</strong></a>.</p>',
    );
  });
  test('mailto links', () => {
    expect(convert('<a href="mailto:a@b.org">a@b.org</a>')).toBe('<p><a href="mailto:a@b.org">a@b.org</a></p>');
  });
  test('relative and javascript: links keep only their text', () => {
    expect(convert('<p><a href="/x">rel</a> <a href="javascript:alert(1)">js</a> <a href="#top">anchor</a></p>')).toBe('<p>rel js anchor</p>');
  });
  test('Google redirect links are unwrapped', () => {
    expect(convert('<a href="https://www.google.com/url?q=https://ex.com/p&amp;sa=D">p</a>')).toBe('<p><a href="https://ex.com/p">p</a></p>');
  });
});

describe('headings', () => {
  test("a Google Docs outline (H1/H2/H3) shifts to FetLife's H2/H3/H4", () => {
    expect(convert('<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4>')).toBe('<h2>A</h2><h3>B</h3><h4>C</h4><h4>D</h4>');
  });
  test('a CMS outline that already starts at H2 is unchanged', () => {
    expect(convert('<h2>A</h2><h3>B</h3><h4>C</h4>')).toBe('<h2>A</h2><h3>B</h3><h4>C</h4>');
  });
  test('deep levels clamp to H4', () => {
    expect(convert('<h2>A</h2><h6>Z</h6>')).toBe('<h2>A</h2><h4>Z</h4>');
  });
  test('bold inside a heading is dropped (headings are already bold)', () => {
    expect(convert('<h2><b>Title</b></h2>')).toBe('<h2>Title</h2>');
  });
});

describe('blocks', () => {
  test('paragraphs and soft line breaks', () => {
    expect(convert('<p>one<br>two</p><p>three</p>')).toBe('<p>one<br>two</p><p>three</p>');
  });
  test('empty spacer paragraphs disappear', () => {
    expect(convert('<p>a</p><p><br></p><p>&nbsp;</p><br><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });
  test('nested bullet and numbered lists', () => {
    expect(convert('<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul><ol start="3"><li>x</li><li>y</li></ol>')).toBe(
      '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul><ol start="3"><li>x</li><li>y</li></ol>',
    );
  });
  test('Google Docs list items wrap text in <p>', () => {
    expect(convert('<ul><li><p role="presentation"><span>one</span></p></li></ul>')).toBe('<ul><li>one</li></ul>');
  });
  test('quotes keep their lines', () => {
    expect(convert('<blockquote><p>a</p><p>b</p></blockquote>')).toBe('<blockquote>a<br>b</blockquote>');
  });
  test('dividers', () => {
    expect(convert('<p>a</p><hr><p>b</p>')).toBe('<p>a</p><hr><p>b</p>');
  });
  test('tables become one line per row', () => {
    expect(convert('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')).toBe('<p>A | B<br>1 | 2</p>');
  });
  test("images are dropped (FetLife event descriptions don't allow them)", () => {
    expect(convert('<p>a <img src="https://ex.com/i.png" alt="pic"> b</p>')).toBe('<p>a b</p>');
  });
  test('scripts, styles and hidden elements are dropped', () => {
    expect(convert('<style>p{}</style><p>a</p><div style="display: none">hidden</div><script>x</script>')).toBe('<p>a</p>');
  });
  test('nothing to paste gives an empty string', () => {
    expect(convert('<p> </p><img src="x.png">')).toBe('');
  });
});
