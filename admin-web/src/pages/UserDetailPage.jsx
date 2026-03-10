import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Popconfirm,
  message,
} from 'antd';
import client from '../api/client';

const { Title } = Typography;

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      try {
        const res = await client.get(`/users/${id}`);
        setUser(res.data);
      } catch {
        message.error('\u52a0\u8f7d\u7528\u6237\u4fe1\u606f\u5931\u8d25');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id]);

  const handleToggleStatus = async () => {
    try {
      const res = await client.patch(`/users/${id}/status`, {
        is_active: !user.is_active,
      });
      setUser((prev) => ({ ...prev, is_active: res.data.is_active }));
      message.success('\u72b6\u6001\u5df2\u66f4\u65b0');
    } catch (err) {
      const code = err.response?.data?.detail?.code;
      if (code === 'cannot_disable_self') {
        message.error('\u4e0d\u80fd\u7981\u7528\u81ea\u5df1\u7684\u8d26\u53f7');
      } else {
        message.error('\u64cd\u4f5c\u5931\u8d25');
      }
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', marginTop: 100 }} />;
  }

  if (!user) {
    return <Title level={4}>{'\u7528\u6237\u4e0d\u5b58\u5728'}</Title>;
  }

  const deviceColumns = [
    { title: 'Device ID', dataIndex: 'device_token', key: 'device_token', ellipsis: true },
    {
      title: 'Token Valid',
      dataIndex: 'token_valid',
      key: 'token_valid',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: '\u66f4\u65b0\u65f6\u95f4',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (t) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
  ];

  const inviteCodeColumns = [
    {
      title: '\u9080\u8bf7\u7801',
      dataIndex: 'code',
      key: 'code',
      render: (code, record) => <Link to={`/invite-codes/${record.id}`}>{code}</Link>,
    },
    { title: '\u5df2\u7528/\u4e0a\u9650', key: 'usage', render: (_, r) => `${r.used_count}/${r.max_uses ?? '\u221e'}` },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button onClick={() => navigate(-1)}>{'\u2190 \u8fd4\u56de'}</Button>

      <Card>
        <Descriptions
          title={
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                {'\u7528\u6237\u8be6\u60c5'}
              </Title>
              <Popconfirm
                title={user.is_active ? '\u786e\u8ba4\u7981\u7528\u8be5\u7528\u6237\uff1f' : '\u786e\u8ba4\u542f\u7528\u8be5\u7528\u6237\uff1f'}
                onConfirm={handleToggleStatus}
              >
                <Button
                  type={user.is_active ? 'default' : 'primary'}
                  danger={user.is_active}
                  size="small"
                >
                  {user.is_active ? '\u7981\u7528' : '\u542f\u7528'}
                </Button>
              </Popconfirm>
            </Space>
          }
          column={2}
          bordered
        >
          <Descriptions.Item label="ID">{user.id}</Descriptions.Item>
          <Descriptions.Item label="VI User ID">{user.vi_user_id || '-'}</Descriptions.Item>
          <Descriptions.Item label="Firebase UID">{user.firebase_uid || '-'}</Descriptions.Item>
          <Descriptions.Item label={'\u90ae\u7bb1'}>{user.email || '-'}</Descriptions.Item>
          <Descriptions.Item label={'\u663e\u793a\u540d'}>{user.display_name || '-'}</Descriptions.Item>
          <Descriptions.Item label={'\u89d2\u8272'}>
            <Tag color={user.role === 'admin' ? 'red' : 'blue'}>{user.role}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={'\u72b6\u6001'}>
            <Tag color={user.is_active ? 'green' : 'default'}>
              {user.is_active ? '\u542f\u7528' : '\u7981\u7528'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={'\u6ce8\u518c\u9080\u8bf7\u7801'}>
            {user.registered_invite_code ? (
              <Link to={`/invite-codes/${user.registered_invite_code.id}`}>
                {user.registered_invite_code.code}
              </Link>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={'\u6700\u540e\u767b\u5f55'}>
            {user.last_login ? new Date(user.last_login).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={'\u521b\u5efa\u65f6\u95f4'}>
            {user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={`设备列表 (${user.devices?.length || 0})`}
        extra={
          user.devices?.length > 0 && (
            <Link to={`/devices?user_id=${user.id}`}>查看全部</Link>
          )
        }
      >
        <Table
          columns={deviceColumns}
          dataSource={user.devices || []}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      <Card
        title={`创建的邀请码 (${user.created_invite_codes?.length || 0})`}
        extra={
          user.created_invite_codes?.length > 0 && (
            <Link to={`/invite-codes?creator_id=${user.id}`}>查看全部</Link>
          )
        }
      >
        <Table
          columns={inviteCodeColumns}
          dataSource={user.created_invite_codes || []}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
}
