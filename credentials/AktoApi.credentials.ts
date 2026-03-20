import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AktoApi implements ICredentialType {
	name = 'aktoApi';
	displayName = 'Akto API';
	icon = { light: 'file:../icons/akto.svg', dark: 'file:../icons/akto.svg' } as const;
	documentationUrl = 'https://docs.akto.io';

	properties: INodeProperties[] = [
		{
			displayName: 'Akto Data Ingestion URL',
			name: 'dataIngestionUrl',
			type: 'string',
			default: '',
			placeholder: 'http://localhost:8080',
			required: true,
			description: 'Base URL of the Akto data ingestion service',
		},
		{
			displayName: 'Akto API Token',
			name: 'aktoApiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'API token for authentication with Akto services (sent as Authorization header)',
		},
		{
			displayName: 'Timeout (seconds)',
			name: 'timeout',
			type: 'number',
			default: 5,
			description: 'Request timeout in seconds',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.aktoApiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.dataIngestionUrl}}',
			url: '/api/auth-check',
			method: 'GET',
		},
	};
}
