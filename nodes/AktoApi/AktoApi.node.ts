import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

const N8N_CONNECTOR = 'n8n';
const ACCOUNT_ID = '1000000';
const DEVICE_ID = '0';
const CONTEXT_SOURCE = 'ENDPOINT';

const OPERATION = {
	GUARDRAILS: 'guardrails',
	INGEST: 'ingest',
} as const;
type Operation = (typeof OPERATION)[keyof typeof OPERATION];

interface AktoRequestParams {
	prompt: string;
	llmResponse: string;
	timestamp: number;
	blocked: boolean;
	reason: string;
	host: string;
	path: string;
	clientIp: string;
}

function buildProxyUrl(base: string, params: Record<string, string>): string {
	const query = Object.entries({ akto_connector: N8N_CONNECTOR, ...params })
		.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
		.join('&');
	return `${base}/api/http-proxy?${query}`;
}

function buildAktoRequest(params: AktoRequestParams): IDataObject {
	const tagsJson = JSON.stringify({
		'gen-ai': 'Gen AI',
		'ai-agent': N8N_CONNECTOR,
		source: CONTEXT_SOURCE,
	});

	const responsePayload = params.blocked
		? JSON.stringify({ body: { 'x-blocked-by': 'Akto Proxy', reason: params.reason } })
		: JSON.stringify({ body: (params.llmResponse ?? '').trim() });

	return {
		path: params.path,
		requestHeaders: JSON.stringify({ host: params.host, 'content-type': 'application/json' }),
		responseHeaders: JSON.stringify({ 'content-type': 'application/json' }),
		method: 'POST',
		requestPayload: JSON.stringify({ body: (params.prompt ?? '').trim() }),
		responsePayload,
		ip: params.clientIp,
		destIp: '127.0.0.1',
		time: String(params.timestamp),
		statusCode: params.blocked ? '403' : '200',
		type: 'HTTP/1.1',
		status: params.blocked ? '403' : '200',
		akto_account_id: ACCOUNT_ID,
		akto_vxlan_id: DEVICE_ID,
		is_pending: 'false',
		source: 'MIRRORING',
		direction: '',
		process_id: '',
		socket_id: '',
		daemonset_id: '',
		enabled_graph: '',
		tag: tagsJson,
		metadata: tagsJson,
		contextSource: CONTEXT_SOURCE,
	};
}

async function callApi(
	ctx: IExecuteFunctions,
	url: string,
	payload: IDataObject,
	timeout: number,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: 'POST',
		url,
		body: payload,
		json: true,
		timeout: timeout * 1000,
		skipSslCertificateValidation: false,
	};
	return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'aktoApi', options)) as IDataObject;
}

function makeItemData(
	ctx: IExecuteFunctions,
	i: number,
	json: IDataObject,
): INodeExecutionData[] {
	return ctx.helpers.constructExecutionMetaData(
		ctx.helpers.returnJsonArray(json),
		{ itemData: { item: i } },
	);
}

function readValidateField(ctx: IExecuteFunctions, safeName: string, field: string, i: number): unknown {
	return ctx.evaluateExpression(`{{ $('${safeName}').item.json.${field} }}`, i);
}

function extractWebhookInfo(item: IDataObject): { webhookHost: string; webhookPath: string; clientIp: string } {
	const headers = (item.headers as IDataObject) ?? {};
	const webhookHost = (headers.host as string) || 'n8n.io';
	const webhookUrlRaw = (item.webhookUrl as string) || '';
	const pathMatch = webhookUrlRaw.match(/^https?:\/\/[^/]+(\/.*)/);
	const webhookPath = pathMatch ? pathMatch[1] : '/n8n';
	const clientIp = (headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
		|| (headers['x-real-ip'] as string)
		|| '';
	return { webhookHost, webhookPath, clientIp };
}

export class AktoApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Akto',
		name: 'aktoApi',
		icon: 'file:../../icons/akto.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] === "guardrails" ? "Validate" : "Ingest"}}',
		description: 'Run prompts through Akto Guardrails and ingest LLM interactions',
		defaults: {
			name: 'Akto',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: `={{ $parameter["operation"] === "${OPERATION.GUARDRAILS}" ? [{ "type": "main", "displayName": "Allowed" }, { "type": "main", "displayName": "Blocked" }] : [{ "type": "main" }] }}`,
		credentials: [
			{
				name: 'aktoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				default: 'guardrails',
				noDataExpression: true,
				options: [
					{
						name: 'Validate',
						value: OPERATION.GUARDRAILS,
						description: 'Validate prompt before sending to AI Agent',
						action: 'Validate prompt with guardrails',
					},
					{
						name: 'Ingest',
						value: OPERATION.INGEST,
						description: 'Ingest prompt and AI Agent response into Akto',
						action: 'Ingest prompt and response',
					},
				],
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '={{ $json.body?.chatInput || $json.chatInput }}',
				placeholder: 'The user prompt...',
				description: 'The user prompt to validate or ingest (reads from body.chatInput for webhooks, or chatInput for chat triggers)',
				displayOptions: {
					show: { operation: [OPERATION.GUARDRAILS] },
				},
			},
			{
				displayName: 'Validate Node Name',
				name: 'validateNodeName',
				type: 'string',
				default: 'Akto',
				description: 'Name of the paired Validate node to read the original prompt from',
				displayOptions: {
					show: { operation: [OPERATION.INGEST] },
				},
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '={{ $($parameter["validateNodeName"]).item.json.chatInput }}',
				placeholder: 'The user prompt...',
				description: 'The original user prompt, read from the paired Validate node',
				displayOptions: {
					show: { operation: [OPERATION.INGEST] },
				},
			},
			{
				displayName: 'Response',
				name: 'response',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '={{ $json.output }}',
				placeholder: 'The AI Agent response...',
				description: 'The AI Agent response to ingest',
				displayOptions: {
					show: { operation: [OPERATION.INGEST] },
				},
			},
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const allowedData: INodeExecutionData[] = [];
		const blockedData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('aktoApi');
		const dataIngestionUrl = (credentials.dataIngestionUrl as string).replace(/\/+$/, '');
		const timeout = (credentials.timeout as number) || 5;
		const operation = this.getNodeParameter('operation', 0) as Operation;

		for (let i = 0; i < items.length; i++) {
			const timestamp = Date.now();
			try {
				const prompt = this.getNodeParameter('prompt', i) as string;

				if (operation === OPERATION.GUARDRAILS) {
					const { webhookHost, webhookPath, clientIp } = extractWebhookInfo(items[i].json);

					const url = buildProxyUrl(dataIngestionUrl, { guardrails: 'true' });
					const payload = buildAktoRequest({
						prompt, llmResponse: '', timestamp, blocked: false, reason: '',
						host: webhookHost, path: webhookPath, clientIp,
					});

					let allowed = true;
					let reason = '';

					try {
						const response = await callApi(this, url, payload, timeout);
						const guardrailsResult = ((response?.data as IDataObject)?.guardrailsResult as IDataObject) ?? {};
						allowed = guardrailsResult.Allowed !== false;
						reason = (guardrailsResult.Reason as string) ?? '';
					} catch {
						// Guardrails service unavailable — fail-open, allow prompt through
						allowed = true;
					}

					const output: IDataObject = {
						chatInput: prompt, webhookHost, webhookPath, clientIp,
						allowed, blocked: !allowed, reason,
					};
					const target = allowed ? allowedData : blockedData;
					target.push(...makeItemData(this, i, output));
				} else {
					const validateNodeName = this.getNodeParameter('validateNodeName', i) as string;
					const safeName = validateNodeName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
					const response = this.getNodeParameter('response', i) as string;

					const webhookHost = readValidateField(this, safeName, 'webhookHost', i) as string || 'n8n.io';
					const webhookPath = readValidateField(this, safeName, 'webhookPath', i) as string || '/n8n/llm';
					const clientIp = readValidateField(this, safeName, 'clientIp', i) as string || '';
					const allowed = (readValidateField(this, safeName, 'allowed', i) as boolean) ?? true;
					const blocked = !allowed;
					const reason = blocked ? ((readValidateField(this, safeName, 'reason', i) as string) ?? '') : '';

					const url = buildProxyUrl(dataIngestionUrl, { ingest_data: 'true' });
					const payload = buildAktoRequest({
						prompt, llmResponse: response, timestamp, blocked, reason,
						host: webhookHost, path: webhookPath, clientIp,
					});

					// fire-and-forget — intentionally non-blocking
					void callApi(this, url, payload, timeout).catch(() => {});

					allowedData.push(...makeItemData(this, i, {
						chatInput: prompt,
						output: allowed ? response : '',
						allowed,
						blocked,
						reason,
					}));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					allowedData.push(...makeItemData(this, i, { error: (error as Error).message }));
					continue;
				}
				throw error;
			}
		}

		return operation === OPERATION.GUARDRAILS ? [allowedData, blockedData] : [allowedData];
	}
}
