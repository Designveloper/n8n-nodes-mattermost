export interface Channel {
	id: string;
	create_at: number;
	update_at: number;
	delete_at: number;
	team_id: string;
	type: 'O' | 'P' | 'D' | 'G';
	display_name: string;
	name: string;
	header: string;
	purpose: string;
	last_post_at: number;
	total_msg_count: number;
	extra_update_at: number;
	creator_id: string;
	scheme_id: string | null;
	props: Record<string, any> | null;
	group_constrained: boolean | null;
	shared: boolean;
	total_msg_count_root: number;
	policy_id: string | null;
	last_root_post_at: number;
}

export interface Team {
	id: string;
	create_at: number;
	update_at: number;
	delete_at: number;
	display_name: string;
	name: string;
	description: string;
	email: string;
	type: 'O' | 'I';
	company_name: string;
	allowed_domains: string;
	invite_id: string;
	allow_open_invite: boolean;
	scheme_id: string | null;
	group_constrained: boolean | null;
	policy_id: string | null;
	cloud_limits_archived: boolean;
}

export interface User {
	id: string;
	username: string;
	first_name?: string;
	last_name?: string;
}
