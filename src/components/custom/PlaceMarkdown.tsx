import { cn } from "cn";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
	a: ({ children, href }) =>
		href ? (
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
			>
				{children}
			</a>
		) : (
			children
		),
	blockquote: ({ children }) => (
		<blockquote className="border-l-2 border-amber-400/50 pl-4 text-muted-foreground italic">
			{children}
		</blockquote>
	),
	code: ({ children, className }) => (
		<code
			className={cn(
				"rounded bg-white/10 px-1 py-0.5 font-mono text-[0.9em] text-amber-200",
				className,
			)}
		>
			{children}
		</code>
	),
	h1: ({ children }) => (
		<h2 className="text-xl font-semibold text-foreground">{children}</h2>
	),
	h2: ({ children }) => (
		<h3 className="text-lg font-semibold text-foreground">{children}</h3>
	),
	h3: ({ children }) => (
		<h4 className="text-base font-semibold text-foreground">{children}</h4>
	),
	h4: ({ children }) => (
		<h5 className="text-sm font-semibold text-foreground">{children}</h5>
	),
	h5: ({ children }) => (
		<h6 className="text-sm font-medium text-foreground">{children}</h6>
	),
	h6: ({ children }) => (
		<h6 className="text-sm font-medium text-foreground">{children}</h6>
	),
	hr: () => <hr className="border-white/10" />,
	img: ({ alt, src }) =>
		src ? (
			<img
				src={src}
				alt={alt ?? ""}
				loading="lazy"
				className="h-auto max-w-full rounded-sm"
			/>
		) : null,
	ol: ({ children }) => (
		<ol className="list-decimal space-y-1 pl-6 marker:text-amber-400">
			{children}
		</ol>
	),
	p: ({ children }) => <p>{children}</p>,
	pre: ({ children }) => (
		<pre className="overflow-x-auto rounded-sm bg-black/20 p-3 text-xs">
			{children}
		</pre>
	),
	strong: ({ children }) => (
		<strong className="font-semibold text-foreground">{children}</strong>
	),
	table: ({ children }) => (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse text-left text-sm">
				{children}
			</table>
		</div>
	),
	td: ({ children }) => (
		<td className="border border-white/10 px-2 py-1">{children}</td>
	),
	th: ({ children }) => (
		<th className="border border-white/10 px-2 py-1 font-semibold text-foreground">
			{children}
		</th>
	),
	ul: ({ children }) => (
		<ul className="list-disc space-y-1 pl-6 marker:text-amber-400">
			{children}
		</ul>
	),
};

export function PlaceMarkdown({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"space-y-3 text-sm leading-6 text-muted-foreground",
				className,
			)}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={markdownComponents}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}
